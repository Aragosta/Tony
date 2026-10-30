# crawler

Fetches pages with a bounded number of requests in flight.

## `mapLimit(items, limit, fn)`
Runs `fn(item, index)` for every item, with at most `limit` calls running at the same time, and resolves to the
results **in input order**.

1. `limit` must be an integer >= 1; otherwise `mapLimit` throws a `RangeError` right away (it does not return a
   rejected promise).
2. At most `limit` calls run at once. A new call starts as soon as a running one settles; it does not wait for a
   whole batch to finish.
3. Calls start in input order.
4. The result array is in input order, whatever order the calls finish in.
5. If a call rejects, the returned promise rejects with that error, and no call that has not started yet is started.
   Calls already running are left to finish; their results are ignored.
6. An empty `items` resolves to `[]` without calling `fn`.
