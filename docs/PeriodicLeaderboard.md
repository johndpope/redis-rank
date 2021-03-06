## PeriodicLeaderboard

This class does not extends `Leaderboard`. This class generates the appropiate `Leaderboard` instance for each period cycle.  
Each cycle (a unique Leaderboard) is identified by a `CycleKey` (a string).

Every time you want to interact with the leaderboard, you need to retrieve the appropiate based on the current time and cycle function. When entering a new cycle, you'll receive the new leaderboard right away. Stale (and active) leaderboards can be retrieved with `getExistingKeys`.

### Types

* `CycleKey`: [string](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/String) uniquely identifies a cycle
* `NowFunction`: `() =>` [Date](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Date)

### Constructor

#### Arguments

* `client`: [Redis](https://github.com/luin/ioredis#connect-to-redis) connection object
* `baseKey`: [string](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/String) prefix for all the leaderboards
* `options`: [PeriodicLeaderboardOptions](/docs/PeriodicLeaderboard.md#arguments) configuration
  * `leaderboardOptions`: [LeaderboardOptions](/docs/Leaderboard.md#arguments) underlying leaderboard options
  * `cycle`: [PeriodicLeaderboardCycle](/docs/PeriodicLeaderboard.md#arguments) = [CycleFunction](/docs/PeriodicLeaderboard.md#arguments) | [DefaultCycles](/docs/PeriodicLeaderboard.md#arguments): time cycle
    * `DefaultCycles`: default cycles  
    Allowed values:
      * `minute`
      * `hourly`
      * `daily`
      * `weekly`: cut is Saturday-Sunday
      * `monthly`
      * `yearly`
    * `CycleFunction`: `(time: Date) =>` [CycleKey](/docs/PeriodicLeaderboard.md#types) takes a time and retruns the appropiate `CycleKey` for that time (internally the suffix for the Redis key).  
    The key returned must be appropiate for local time (not UTC).  
    See [EXAMPLES.md](EXAMPLES.md) for examples.
  * `now`?: [NowFunction](/docs/PeriodicLeaderboard.md#types): function to evaluate the current time.  
  If not provided, a function returning the local time will be used

#### Example

```javascript
const plb = new PeriodicLeaderboard(client, "plb:test", {
  leaderboardOptions: {
    sortPolicy: 'high-to-low',
    updatePolicy: 'replace'
  },
  cycle: 'monthly'
});
```

### Keys

* `getKey(time: Date)`: [CycleKey](/docs/PeriodicLeaderboard.md#types) get the cycle key at a specified date and time
  * `time`: [Date](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Date) the time

* `getKeyNow()`: [CycleKey](/docs/PeriodicLeaderboard.md#types) get the current leaderboard based on the time returned by `now()`

* `getExistingKeys()`: [Promise](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Promise)<[CycleKey](/docs/PeriodicLeaderboard.md#types)[]> find all the active cycle keys in the database.  
  Use this function sparsely, it uses `SCAN` over the whole database to find matches.  
  ⚠️ I recommend having periodic leaderboards on a database index other than the main one if you plan to call this function a lot.
  #### Complexity
  `O(N)` where N is the number of keys in the Redis database

### Leaderboards

* `getLeaderboard(key: CycleKey)`: [Leaderboard](/docs/Leaderboard.md) get the leaderboard for the provided cycle key
  * `key`: [CycleKey](/docs/PeriodicLeaderboard.md#types) cycle key

* `getLeaderboardAt(time?: Date)`: [Leaderboard](/docs/Leaderboard.md) get the leaderboard at the specified date and time
  * `time`?: [Date](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Date) the time

  If `time` is not provided, it will use the time returned by `now()`

* `getLeaderboardNow()`: [Leaderboard](/docs/Leaderboard.md) get the current leaderboard based on the time returned by `now()`
