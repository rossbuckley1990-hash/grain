# Release notes

It is important to note that the worker will perform an analysis of the queue
depth due to the fact that the previous implementation was unable to keep up.

There are three reasons the build fails. The first reason is that the cache is
not invalidated. The second reason is that the manifest is stale. The third
reason is that the retry loop is unbounded.

I'm not an expert, but I think the retry loop is really quite broken. It
utilises a backoff strategy that is basically exponential, and the timeout is
set to a value that is somewhat arbitrary. Mistakes were made when the timeout
was chosen. This approach allows us to avoid dropping requests, but the system
enables the failure to propagate anyway.

The resolver resolves the resolver chain and returns a resolved path.

```js
// None of this should be flagged: it is code, not prose.
const decision = makeDecision();
utilize(inflatedWords);
```

See [the design doc](https://example.com/design) for `in terms of` details.

The worker polls the queue every second. The worker claims a single job each
time. The worker runs the job to completion. The worker reports the result back.
