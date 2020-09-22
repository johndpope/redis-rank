import { Redis } from 'ioredis';
import { Leaderboard, LeaderboardOptions } from './Leaderboard';

/** uniquely identifies a cycle */
export type PeriodicKey = string;

export type DefaultCycles =
    'minute'  |
    'hourly'  |
    'daily'   |
    'weekly'  |
    'monthly' |
    'yearly';

export type NowFunction = () => Date;
export type CycleFunction = (time: Date) => PeriodicKey;

/**
 * The cycle of a periodic leaderboard.  
 * You can use one of the predefined cycles:  
 * `minute`, `hourly`, `daily`, `weekly`, `monthly`, `yearly`, `all-time`
 * 
 * Or you can specify a custom function, taking a Date object and returning the
 * corresponding PeriodicKey for the provided time (internally this is the
 * suffix for the Redis key)
 */
export type PeriodicLeaderboardCycle = CycleFunction | DefaultCycles;

export type PeriodicLeaderboardOptions = {
    /** underlying leaderboard options  */
    leaderboardOptions: LeaderboardOptions,
    /** function to evaluate the current time */
    now?: NowFunction,
    /** cycle */
    cycle: PeriodicLeaderboardCycle
}

/**
 * Used by `getWeekNumber`. Needed because Date.getTime returns the time in UTC
 * and we use local time.
 */
const msTimezoneOffset = new Date().getTimezoneOffset() * 60 * 1000;

/**
 * Get the week number since January 1st, 1970
 * 
 * 345600000 = 4 days in milliseconds
 * 604800000 = 1 week in milliseconds
 * 
 * Note: we add 4 days because January 1st, 1970 was thursday (and weeks start
 * on sunday). I think it should be 3 days a not 4, but 3 resutls in
 * incorrect values. ¯\_(ツ)_/¯
 */
const getWeekNumber = (time: Date) => Math.floor((time.getTime() + 345600000 - msTimezoneOffset) / 604800000);

/**
 * Note: default functions use local time to determine keys.  
 * Tip: You can specify the `now()` function in the periodic leaderboard options
 * to offset the time however you like.
 */
const CYCLE_FUNCTIONS: { [cycle in DefaultCycles]: CycleFunction } = {
    'yearly':   (time: Date) => `y${time.getFullYear()}`,
    'weekly':   (time: Date) => `y${time.getFullYear()}-w${getWeekNumber(time)}`,
    'monthly':  (time: Date) => `y${time.getFullYear()}-m${time.getMonth()}`,
    'daily':    (time: Date) => `y${time.getFullYear()}-m${time.getMonth()}-d${time.getDate()}`,
    'hourly':   (time: Date) => `y${time.getFullYear()}-m${time.getMonth()}-d${time.getDate()}-h${time.getHours()}`,
    'minute':   (time: Date) => `y${time.getFullYear()}-m${time.getMonth()}-d${time.getDate()}-h${time.getHours()}-m${time.getMinutes()}`,
};

export class PeriodicLeaderboard {

    public readonly client: Redis;
    public readonly baseKey: string;
    public readonly options: PeriodicLeaderboardOptions;
    
    private readonly leaderboards: Map<string, Leaderboard>;

    /**
     * Create a new periodic leaderboard
     * 
     * Use `getCurrentLeaderboard` to get the leaderboard of the current cycle
     * 
     * @param client ioredis client
     * @param baseKey prefix for all the leaderboards
     * @param options periodic leaderboard options
     */
    constructor(client: Redis, baseKey: string, options: PeriodicLeaderboardOptions) {
        this.client = client;
        this.baseKey = baseKey;
        this.options = options;

        this.leaderboards = new Map();
    }

    /**
     * Get the periodic key at a specified date and time
     * 
     * @param time the time
     */
    getKey(time: Date): PeriodicKey {
        return (CYCLE_FUNCTIONS[this.options.cycle as DefaultCycles] || this.options.cycle)(time);
    }

    /**
     * Get the leaderboard for the provided periodic key
     * 
     * @param key periodic key
     */
    getLeaderboard(key: PeriodicKey): Leaderboard {
        let finalKey = `${this.baseKey}:${key}`;

        let lb = this.leaderboards.get(finalKey);
        if(lb) return lb; // hit cache

        // Note: avoid leaking leaderboards
        if(this.leaderboards.size > 100)
            this.leaderboards.clear();

        lb = new Leaderboard(this.client, finalKey, this.options.leaderboardOptions);
        this.leaderboards.set(finalKey, lb);
        return lb;
    }

    /**
     * Get the leaderboard at the specified date and time. If `time` is not
     * provided, it will use the time returned by `now()`.
     * 
     * @param time the time
     */
    getLeaderboardAt(time?: Date): Leaderboard {
        return this.getLeaderboard(time ? this.getKey(time) : this.getKeyNow());
    }

    /**
     * Get the periodic key that should be used based on the time returned
     * by `now()`
     */
    getKeyNow(): PeriodicKey {
        return this.getKey(this.options.now ? this.options.now() : new Date());
    }

    /**
     * Get the current leaderboard based on the time returned by `now()`
     */
    getLeaderboardNow(): Leaderboard {
        return this.getLeaderboard(this.getKeyNow());
    }

    getExistingKeys(): PeriodicKey[] {
        // TODO!
        return [];
    }
}
