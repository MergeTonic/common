# mergetonic-hf-weave

Installs the `hf-weave` console script (discovered as `hf weave` when using Hugging Face CLI extensions).

```bash
pip install mergetonic-hf-weave
hf extensions install mergetonic/hf-weave   # after repo is published as hf-weave
```

```bash
hf-weave sync --repo . --update-index
hf-weave sync --repo . --publish-ctrd --replay-path my/file.txt --steps-json steps.json --update-index
hf-weave sync --dry-run --offline   # print planned steps only
```

Monorepo docs: [docs/tonic-hf-weave.md](../../docs/tonic-hf-weave.md).
