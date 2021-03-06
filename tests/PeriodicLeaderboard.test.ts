import {
    LeaderboardOptions,
    DefaultCycles,
    CycleKey,
    CycleFunction,
    PeriodicLeaderboard
} from '../lib/index';
import rc from './redis';

const TEST_KEY = "plb";

const lbOptions: LeaderboardOptions = {
    sortPolicy: 'high-to-low',
    updatePolicy: 'replace'
};

// everything goes downhill from this date on
const REFERENCE_DATE = new Date(
    2020, // year
    0, // month
    1, // day number
    0, // hour
    0, // minutes
    1 // seconds
);

describe("PeriodicLeaderboard", () => {
    let plb: PeriodicLeaderboard;

    describe.each([
        ['minute',  5000, 60],
        ['hourly',  5000, 60 * 60],
        ['daily',   5000, 60 * 60 * 24],
        // the next three are not exact, but it works for a few
        ['weekly',    50, 60 * 60 * 24 * 7],
        ['monthly',   25, 60 * 60 * 24 * 31],
        ['yearly',   100, 60 * 60 * 24 * 366] // (the reference is a leap year)
    ])('default cylce %s', (cycle, cyclesToTest, windowSecs) => { // windowSecs is aprox
        beforeEach(() => {
            plb = new PeriodicLeaderboard(rc, TEST_KEY, {
                leaderboardOptions: lbOptions,
                cycle: cycle as DefaultCycles
            });
        });

        test("expected cycle key", () => {
            const halfWindowSecs = windowSecs * 0.5;

            let lastKey: CycleKey = plb.getKey(REFERENCE_DATE);
            for(let i = 0; i < cyclesToTest; i++) {
                let time = new Date(REFERENCE_DATE);
                time.setSeconds(time.getSeconds() + i * windowSecs + halfWindowSecs); // advance half cycle
                expect(lastKey).toBe(plb.getKey(time)); // should still be in the same cycle

                time = new Date(REFERENCE_DATE);
                time.setSeconds(time.getSeconds() + (i + 1) * windowSecs); // advance a full cycle
                expect(lastKey).not.toBe(plb.getKey(time)); // should be in a new cycle

                lastKey = plb.getKey(time);
            }
        });
    });

    test.each([
        ['5 minutes', 60 * 5, (time: Date): CycleKey => `y${time.getFullYear()}-m${time.getMonth()}-d${time.getDate()}-h${time.getHours()}-5m${Math.floor(time.getMinutes() / 5)}`],
        ['3 hours', 60 * 60 * 3, (time: Date): CycleKey => `y${time.getFullYear()}-m${time.getMonth()}-d${time.getDate()}-h${Math.floor(time.getHours() / 3)}`]
    ])('custom cylce %s cycle key', (_, windowSecs, cycle: CycleFunction) => { // windowSecs is exact
        plb = new PeriodicLeaderboard(rc, TEST_KEY, {
            leaderboardOptions: lbOptions,
            cycle: cycle
        });

        let time = new Date(REFERENCE_DATE);
        let lastKey: CycleKey = plb.getKey(time);
        for(let i = 0; i < 5000; i++) {
            time.setSeconds(time.getSeconds() + windowSecs);
            expect(lastKey).not.toBe(plb.getKey(time));
            lastKey = plb.getKey(time);
        }
    });
    
    test.each([
        ['minute',  new Date(2020,  0,  1, 23, 59, 59) ],
        ['hourly',  new Date(2020,  0,  1, 23, 59, 59) ],
        ['daily',   new Date(2020,  0,  1, 23, 59, 59) ],
        ['weekly',  new Date(2020,  0,  4, 23, 59, 59) ],
        ['monthly', new Date(2020,  0, 31, 23, 59, 59) ],
        ['yearly',  new Date(2020, 11, 31, 23, 59, 59) ]
    ])('check expect cut point %s', (cycle, time) => {
        plb = new PeriodicLeaderboard(rc, TEST_KEY, {
            leaderboardOptions: lbOptions,
            cycle: cycle as DefaultCycles
        });
        let nextTime = new Date(time);
        nextTime.setSeconds(nextTime.getSeconds() + 2);

        expect(plb.getKey(time)).not.toBe(plb.getKey(nextTime));
    });

    test("current time & leaderboard", () => {
        plb = new PeriodicLeaderboard(rc, TEST_KEY, {
            leaderboardOptions: lbOptions,
            cycle: 'minute'
        });
        expect(plb.getLeaderboardNow().redisKey).toBe(`${TEST_KEY}:${plb.getKey(new Date())}`);
    });
    
    test("custom now", () => {
        plb = new PeriodicLeaderboard(rc, TEST_KEY, {
            leaderboardOptions: lbOptions,
            cycle: 'minute',
            now: () => REFERENCE_DATE
        });
        expect(plb.getKeyNow()).toBe(`y2020-m00-d01-h00-m00`);
    });

    describe("cache leaderboard objects", () => {
        beforeEach(() => {
            plb = new PeriodicLeaderboard(rc, TEST_KEY, {
                leaderboardOptions: lbOptions,
                cycle: 'minute'
            });
        });

        test("get same leaderboard", () => {
            plb = new PeriodicLeaderboard(rc, TEST_KEY, {
                leaderboardOptions: lbOptions,
                cycle: 'minute'
            });
            expect(plb.getLeaderboardAt(REFERENCE_DATE)).toBe(plb.getLeaderboardAt(REFERENCE_DATE));
        });

        test("avoid leaking", () => {
            plb = new PeriodicLeaderboard(rc, TEST_KEY, {
                leaderboardOptions: lbOptions,
                cycle: 'minute'
            });
            let time = new Date(REFERENCE_DATE);
            for(let i = 0; i < 1000; i++) {
                time.setSeconds(time.getSeconds() + 999999);
                plb.getLeaderboardAt(time); // store in cache
            }

            let plbAny: any = plb;
            expect(plbAny.leaderboards.size).toBeGreaterThan(10); // some
            expect(plbAny.leaderboards.size).toBeLessThan(101); // but not much
        });
    });
    
    test("existing keys", async () => {
        let h = 0;
        plb = new PeriodicLeaderboard(rc, TEST_KEY, {
            leaderboardOptions: lbOptions,
            cycle: 'hourly',
            now: () => new Date(2020, 1, 1, h++)
        });
        for(let i = 0; i < 1234; i++)
            await plb.getLeaderboardNow().updateOne(`${Math.random()*10e8}`, Math.random()*10e8);
        let keys = await plb.getExistingKeys();
        expect(keys).toHaveLength(1234);
        for(let key of keys)
            await plb.getLeaderboard(key).clear();
        expect(await plb.getExistingKeys()).toHaveLength(0);
    });
});