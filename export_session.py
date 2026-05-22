"""Export Claude Code session transcript to Markdown.

Reads the project's .jsonl session log and writes a human-readable
SESSION.md alongside it. Strips system reminders and tool-call noise.
"""
import json
import os
import re
import sys
from pathlib import Path

SESSION_PATH = Path.home() / ".claude" / "projects" / "C--Users-max-Desktop-SparkJam-SparkJamMiro" / "03a29d6d-b416-4b67-acc2-f77ccc506f49.jsonl"
OUT_PATH = Path(__file__).parent / "SESSION.md"


def clean_text(text: str) -> str:
    """Strip system-reminder tags and similar noise."""
    if not text:
        return ""
    text = re.sub(r"<system-reminder>.*?</system-reminder>", "", text, flags=re.DOTALL)
    text = re.sub(r"<command-name>.*?</command-name>", "", text, flags=re.DOTALL)
    text = re.sub(r"<command-message>.*?</command-message>", "", text, flags=re.DOTALL)
    text = re.sub(r"<command-args>.*?</command-args>", "", text, flags=re.DOTALL)
    text = re.sub(r"<local-command-stdout>.*?</local-command-stdout>", "", text, flags=re.DOTALL)
    text = re.sub(r"<local-command-caveat>.*?</local-command-caveat>", "", text, flags=re.DOTALL)
    return text.strip()


def extract_user(message) -> str | None:
    """Return the user's text content, or None if this is just a tool result."""
    content = message.get("content")
    if isinstance(content, str):
        return clean_text(content) or None
    if isinstance(content, list):
        parts = []
        for block in content:
            if not isinstance(block, dict):
                continue
            btype = block.get("type")
            if btype == "text":
                parts.append(clean_text(block.get("text", "")))
            elif btype == "tool_result":
                # Tool results are how prior tool calls return — skip
                continue
            elif btype == "image":
                parts.append("_[image attached]_")
        text = "\n".join(p for p in parts if p)
        return text.strip() or None
    return None


def extract_assistant(message) -> tuple[str, list[str]]:
    """Return (text content, list of tool-call summaries)."""
    content = message.get("content")
    text_parts = []
    tool_calls = []
    if isinstance(content, list):
        for block in content:
            if not isinstance(block, dict):
                continue
            btype = block.get("type")
            if btype == "text":
                text_parts.append(block.get("text", "").strip())
            elif btype == "thinking":
                continue  # skip extended thinking
            elif btype == "tool_use":
                name = block.get("name", "tool")
                inp = block.get("input", {}) or {}
                summary = summarize_tool(name, inp)
                tool_calls.append(summary)
    return "\n\n".join(p for p in text_parts if p), tool_calls


def summarize_tool(name: str, inp: dict) -> str:
    """One-line summary of a tool call."""
    if name == "Edit":
        return f"_Edit {inp.get('file_path', '?')}_"
    if name == "Write":
        return f"_Write {inp.get('file_path', '?')}_"
    if name == "Read":
        path = inp.get("file_path", "?")
        offset = inp.get("offset")
        return f"_Read {path}_" + (f" (offset {offset})" if offset else "")
    if name == "Bash":
        cmd = (inp.get("command") or "").strip()
        if len(cmd) > 100:
            cmd = cmd[:97] + "..."
        return f"_Bash:_ `{cmd}`"
    if name == "PowerShell":
        cmd = (inp.get("command") or "").strip()
        if len(cmd) > 100:
            cmd = cmd[:97] + "..."
        return f"_PowerShell:_ `{cmd}`"
    if name == "Glob":
        return f"_Glob {inp.get('pattern', '?')}_"
    if name == "Grep":
        return f"_Grep {inp.get('pattern', '?')}_"
    if name == "TaskCreate":
        return f"_TaskCreate: {inp.get('subject', '?')}_"
    if name == "TaskUpdate":
        return f"_TaskUpdate #{inp.get('taskId', '?')} -> {inp.get('status', '?')}_"
    if name == "Agent":
        return f"_Agent ({inp.get('subagent_type', 'general')}): {inp.get('description', '?')}_"
    if name == "AskUserQuestion":
        qs = inp.get("questions", [])
        if qs:
            return f"_Ask:_ {qs[0].get('question', '?')[:80]}"
        return "_Ask:_"
    if name == "ExitPlanMode":
        return "_ExitPlanMode_"
    if name == "ToolSearch":
        return f"_ToolSearch: {inp.get('query', '?')}_"
    if name == "ScheduleWakeup":
        return f"_ScheduleWakeup_"
    return f"_{name}_"


def main():
    if not SESSION_PATH.exists():
        print(f"Session file not found: {SESSION_PATH}", file=sys.stderr)
        sys.exit(1)

    out = []
    out.append("# Claude Code Session — SparkJamMiro\n")
    out.append(
        "_This is an export of the conversation that built the accessibility menu and "
        "screen-reader improvements for this prototype. Tool calls are summarised; "
        "extended thinking is omitted._\n"
    )
    out.append("---\n")

    n_user = 0
    n_assistant = 0

    with SESSION_PATH.open(encoding="utf-8") as f:
        for line in f:
            try:
                obj = json.loads(line)
            except json.JSONDecodeError:
                continue
            etype = obj.get("type")
            if etype not in ("user", "assistant"):
                continue
            msg = obj.get("message")
            if not isinstance(msg, dict):
                continue

            if etype == "user":
                text = extract_user(msg)
                if not text:
                    continue
                n_user += 1
                out.append(f"## User\n\n{text}\n")
            else:
                text, tools = extract_assistant(msg)
                if not text and not tools:
                    continue
                n_assistant += 1
                out.append("## Claude\n")
                if text:
                    out.append(f"\n{text}\n")
                if tools:
                    # Group tool calls compactly
                    out.append("\n" + "  •  ".join(tools) + "\n")

    out.append("\n---\n")
    out.append(f"_Total: {n_user} user turns, {n_assistant} assistant turns._\n")

    OUT_PATH.write_text("\n".join(out), encoding="utf-8")
    print(f"Wrote {OUT_PATH} ({OUT_PATH.stat().st_size:,} bytes)")


if __name__ == "__main__":
    main()
