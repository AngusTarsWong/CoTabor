# Third-Party Notices

This repository includes ideas, integration patterns, and runtime dependencies that were informed by the following open-source projects.

## Midscene

- Project: [web-infra-dev/midscene](https://github.com/web-infra-dev/midscene)
- Copyright: Bytedance, Inc. and its affiliates
- License: MIT
- Usage in CoTabor:
  - Runtime dependency on `@midscene/web`
  - Reference for vision-guided browser interaction and Chrome bridge patterns

## PageAgent

- Project: [alibaba/page-agent](https://github.com/alibaba/page-agent)
- Copyright: Alibaba and Simon
- License: MIT
- Usage in CoTabor:
  - Runtime dependency on `@page-agent/page-controller`
  - Bundled runtime asset generated into `public/page-agent.bundle.js`
  - Reference for semantic DOM extraction and page interaction abstractions

## web-access

- Project: [eze-is/web-access](https://github.com/eze-is/web-access)
- Copyright: Eze
- License: MIT
- Usage in CoTabor:
  - Reference for skill-oriented web access patterns
  - Reference for CDP browser operation workflow and site-pattern accumulation

## Notes

- The historical local source snapshots under `midsense/`, `pageagent/`, and `web_access/` are not part of the ongoing upstream sync path for this repository.
- Their removal from this repository does not transfer or replace the original upstream licenses.
- When redistributing this project, keep this notice together with the root [LICENSE](./LICENSE).
