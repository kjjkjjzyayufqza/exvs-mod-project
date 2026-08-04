# GPT Fast Verification

## Goal

Reduce GPT-5.6 Sol verification time and token use while retaining one fresh,
high-signal completion proof.

## Decisions

- Add global and project `gpt-fast-path` / `gpt-fast-verify` skills.
- Replace broad global verification skill chains with one-command semantic
  gates.
- Make project rules prefer one discovery route and stop after first passing
  verifier.
- Keep broad verification only for explicit, release, security, or data-loss
  risk cases.

## Source Evidence

- OpenAI Codex AGENTS rules scope tests to the changed project, require approval
  before full suites, avoid routine `--all-features`, and say not to rerun tests
  after formatting: https://github.com/openai/codex/blob/main/AGENTS.md
- OpenAI skill-creator requires concise skills and a single structural
  validator: https://github.com/openai/skills/blob/main/skills/.system/skill-creator/SKILL.md

## Verification

One PowerShell wrapper ran OpenAI `quick_validate.py` for both project skills
and compared project/global `SKILL.md` plus `agents/openai.yaml` contents.
Result: both skills valid; both copies identical. No app tests were run.
