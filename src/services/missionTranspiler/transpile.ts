import { MAX_SOURCE_LENGTH, MissionError } from "./missionErrors";
import { INTRO_ACTIONS, LOSE_RULES, NAMED_PARAMS, validateMission, WIN_RULES } from "./model";
import { MISSION_C_TEMPLATE } from "./template";
import type { MissionAction, MissionModel, MissionPhase, Trigger } from "./types";

export const hex = (value: number): string => value === 0 ? "0" : `0x${(value >>> 0).toString(16)}`;
const signed = (value: number) => value | 0;
const cList = (values: number[]) => values.map(hex).join(", ");
const arrayText = (values: (number | string)[]) => `{ ${values.join(", ")} }`;

/** MSC-C lexer used only to compare structure and parse the supported template. */
export function cTokens(source: string): string[] {
  return cTokenSpans(source).map((token) => token.value);
}

/** Source offsets allow mission edits without reformatting untouched code. */
export function cTokenSpans(source: string): { value: string; start: number; end: number }[] {
  if (source.length > MAX_SOURCE_LENGTH) throw new MissionError("Source exceeds 512 KiB");
  const tokens: { value: string; start: number; end: number }[] = [];
  const token = /\s+|\/\/[^\n\r]*|\/\*[\s\S]*?\*\/|0[xX][\da-fA-F]+|\d+|[A-Za-z_]\w*|==|!=|<=|>=|&&|\|\||<<|>>|\+\+|--|[+\-*/%&|^]=|[{}()[\];,=+\-*/%&|^!~<>]/y;
  let at = 0;
  while (at < source.length) {
    token.lastIndex = at;
    const match = token.exec(source);
    if (!match) throw new MissionError("Unsupported MSC C token", source.slice(0, at).split("\n").length, 1);
    at = token.lastIndex;
    const text = match[0];
    if (/^\s|^\/\//.test(text) || text.startsWith("/*")) continue;
    tokens.push({ value: /^\d/.test(text) ? String(Number(text)) : text, start: match.index, end: at });
  }
  return tokens;
}

interface CFunction { name: string; body: string[]; all: string[] }
function splitC(source: string): { globals: string[]; functions: CFunction[] } {
  const tokens = cTokens(source);
  const functions: CFunction[] = [];
  let at = 0;
  while (tokens[at] === "int" && /^global\d+$/.test(tokens[at + 1] ?? "") && tokens[at + 2] === ";") at += 3;
  const globals = tokens.slice(0, at);
  while (at < tokens.length) {
    const start = at;
    if (!["int", "void"].includes(tokens[at]) || !/^(?:func_\d+|main)$/.test(tokens[at + 1] ?? "")) throw new MissionError("Expected a template function declaration");
    const name = tokens[at + 1];
    at += 2;
    if (tokens[at] !== "(") throw new MissionError(`Invalid signature for ${name}`);
    while (at < tokens.length && tokens[at] !== "{") at++;
    const bodyAt = ++at;
    let depth = 1;
    while (at < tokens.length && depth) {
      if (tokens[at] === "{") depth++;
      if (tokens[at] === "}") depth--;
      at++;
    }
    if (depth) throw new MissionError(`Unclosed function ${name}`);
    functions.push({ name, body: tokens.slice(bodyAt, at - 1), all: tokens.slice(start, at) });
  }
  return { globals, functions };
}

const templateParts = splitC(MISSION_C_TEMPLATE);
const templatePrefix = MISSION_C_TEMPLATE.slice(0, MISSION_C_TEMPLATE.indexOf("void func_32()"));
const setupSource = MISSION_C_TEMPLATE.slice(MISSION_C_TEMPLATE.indexOf("void func_33()"), MISSION_C_TEMPLATE.indexOf("void func_34()"));

function triggerC(trigger: Trigger): string {
  if (trigger.kind === "enemies_alive_at_most") return `sys_0(0x40f) <= ${hex(trigger.value)}`;
  if (trigger.kind === "elapsed_frames_at_least") return `sys_0(0x459) >= ${hex(trigger.value)}`;
  return `sys_0(0x45a, ${hex(trigger.slot)}) <= ${hex(trigger.value)}`;
}

function actionC(action: MissionAction): string {
  switch (action.op) {
    case "deploy": return `func_12(${hex(action.slot)});`;
    case "message": return `sys_0(0x355, ${hex(action.slot)}, ${hex(action.messageHash)});`;
    case "bgm": return `sys_0(0x33f, ${hex(action.bgm)});`;
    case "raw_sys": return `sys_0(${cList([action.command, ...action.args])});`;
  }
}

export function generateC(model: MissionModel): string {
  validateMission(model);
  const { battle: b } = model;
  const config = [
    `    sys_0(0x40e, ${hex(b.map)});`,
    ...b.teamCosts.map(({ team, cost }) => `    global${team + 1} = ${hex(cost)};`),
    ...[[16, b.win], [17, b.lose], [12, b.targetCount], [10, b.allowedLosses], [19, b.bgm]].map(([n, value]) => `    global${n} = ${hex(value)};`),
    ...model.slots.map((p) => `    sys_0(0x400, ${cList(p)});`),
  ];
  const phases = model.phases.map((p, i) => `    ${i ? "else if" : "if"} (global20 == ${hex(i)})
    {
        if (${triggerC(p.trigger)})
        {
            if ((global24 = func_2(global24, ${hex(p.delaySeconds)})) == 0xffffffff)
            {
                global24 = 0;
                global20 = ${hex(i + 1)};
${p.actions.map((a) => `                ${actionC(a)}`).join("\n")}
            }
        }
    }`).join("\n");
  return `${templatePrefix}// AI decision (2026-09-20): Generate mission content from the embedded OBHK template.
// global16/17 retain the template rule masks; all 51 sys_0(0x400) words are emitted.
// global0 handovers and global20/global24 ownership remain with the original scaffold.
// Origin: AI-assisted generation from 000triad_battle_a030_001.c; source structure is E1, gameplay is unverified.
void func_32()
{
${config.join("\n")}
}

${setupSource}void func_34()
{
    while (sys_0(0x454) != 0x1)
    {
        sys_0(0x800);
    }
    func_9();
${model.opening.map((slot) => `    func_12(${hex(slot)});`).join("\n")}
    sys_0(0x453, 0x1);
    global0 = func_35;
    sys_0(0x33f, global19);
}

void func_35()
{
${phases}${phases ? "\n" : ""}    ${phases ? "else if" : "if"} (global20 == ${hex(model.phases.length)})
    {
    }
}
// End, origin is 000triad_battle_a030_001.c func_32..func_35; the fixed prefix is preserved.
`;
}

class Reader {
  private at = 0;
  constructor(private readonly tokens: string[], private readonly context: string) {}
  peek() { return this.tokens[this.at]; }
  done() { return this.at === this.tokens.length; }
  take(expected: string) {
    for (const token of cTokens(expected)) {
      if (this.tokens[this.at++] !== token) throw new MissionError(`${this.context}: expected '${expected}' near token ${this.at}`);
    }
  }
  word() {
    let sign = 1;
    if (this.peek() === "-") { this.at++; sign = -1; }
    const next = this.tokens[this.at++];
    if (!/^\d+$/.test(next ?? "")) throw new MissionError(`${this.context}: expected a literal integer`);
    const value = Number(next) * sign;
    if (!Number.isSafeInteger(value) || value < -0x80000000 || value > 0xffffffff) throw new MissionError(`${this.context}: word exceeds 32 bits`);
    return value >>> 0;
  }
  name() { return this.tokens[this.at++]; }
  end() { if (!this.done()) throw new MissionError(`${this.context}: unsupported extra statements`); }
}

export function modelFromC(source: string): MissionModel {
  const parts = splitC(source);
  const same = (a: string[], b: string[]) => a.join(" ") === b.join(" ");
  if (!same(parts.globals, templateParts.globals) || parts.functions.length !== templateParts.functions.length) throw new MissionError("C does not match the embedded OBHK template globals/function count");
  parts.functions.forEach((f, i) => {
    const reference = templateParts.functions[i];
    if (f.name !== reference.name) throw new MissionError("Function order changed; fixed coroutine addresses would drift");
    if (!["func_32", "func_34", "func_35"].includes(f.name) && !same(f.all, reference.all)) throw new MissionError(`${f.name}: fixed template code changed; conversion refused`);
    if (["func_32", "func_34", "func_35"].includes(f.name) && !same(f.all.slice(0, 5), reference.all.slice(0, 5))) throw new MissionError(`${f.name}: function signature changed`);
  });
  const reader = (name: string) => new Reader(parts.functions.find((f) => f.name === name)!.body, name);
  const config = reader("func_32");
  config.take("sys_0(0x40e,");
  const map = config.word();
  config.take(");");
  const assignments = new Map<number, number>();
  while (config.peek()?.startsWith("global")) {
    const n = Number(config.name().slice(6));
    if (![1, 2, 3, 4, 5, 6, 16, 17, 12, 10, 19].includes(n) || assignments.has(n)) throw new MissionError(`Unsupported or duplicate global${n} assignment`);
    config.take("="); assignments.set(n, config.word()); config.take(";");
  }
  const slots: number[][] = [];
  while (!config.done()) {
    config.take("sys_0(0x400");
    const p: number[] = [];
    while (config.peek() === ",") { config.take(","); p.push(config.word()); }
    config.take(");"); slots.push(p);
  }
  const required = (n: number) => {
    const value = assignments.get(n);
    if (value === undefined) throw new MissionError(`Missing global${n} assignment`);
    return value;
  };
  const opening: number[] = [];
  const start = reader("func_34");
  start.take("while (sys_0(0x454) != 0x1) { sys_0(0x800); } func_9();");
  while (start.peek() === "func_12") {
    start.take("func_12("); opening.push(start.word()); start.take(");");
  }
  start.take("sys_0(0x453, 0x1); global0 = func_35; sys_0(0x33f, global19);"); start.end();
  const phases: MissionPhase[] = [];
  const chain = reader("func_35");
  let terminal = false;
  while (!chain.done()) {
    if (phases.length) chain.take("else");
    chain.take("if (global20 ==");
    if (chain.word() !== phases.length) throw new MissionError("Non-sequential phase chain");
    chain.take(") {");
    if (chain.peek() === "}") { chain.take("}"); chain.end(); terminal = true; break; }
    chain.take("if (sys_0(");
    const command = chain.word();
    let trigger: Trigger;
    if (command === 0x45a) {
      chain.take(","); const slot = chain.word(); chain.take(") <=");
      trigger = { kind: "slot_hp_percent_at_most", slot, value: chain.word() };
    } else if (command === 0x40f || command === 0x459) {
      chain.take(command === 0x40f ? ") <=" : ") >=");
      trigger = { kind: command === 0x40f ? "enemies_alive_at_most" : "elapsed_frames_at_least", value: chain.word() };
    } else throw new MissionError(`Unsupported trigger sys_0(${hex(command)})`);
    chain.take(") { if ((global24 = func_2(global24,");
    const delaySeconds = chain.word();
    chain.take(")) == 0xffffffff) { global24 = 0; global20 =");
    if (chain.word() !== phases.length + 1) throw new MissionError("Incorrect next phase");
    chain.take(";");
    const actions: MissionAction[] = [];
    while (chain.peek() !== "}") {
      if (chain.peek() === "func_12") {
        chain.take("func_12("); actions.push({ op: "deploy", slot: chain.word() }); chain.take(");");
      } else {
        chain.take("sys_0("); const cmd = chain.word(); const args: number[] = [];
        while (chain.peek() === ",") { chain.take(","); args.push(chain.word()); }
        chain.take(");");
        if (cmd === 0x355 && args.length === 2) actions.push({ op: "message", slot: args[0], messageHash: args[1] });
        else if (cmd === 0x33f && args.length === 1) actions.push({ op: "bgm", bgm: args[0] });
        else if (cmd >= 0x100 && cmd <= 0x8ff) actions.push({ op: "raw_sys", command: cmd, args });
        else throw new MissionError(`Unsupported mission syscall ${hex(cmd)}`);
      }
    }
    chain.take("} } }");
    phases.push({ trigger, delaySeconds, actions });
  }
  if (!terminal) throw new MissionError("Missing terminal phase");
  const model: MissionModel = {
    battle: { map, teamCosts: [...assignments].filter(([n]) => n >= 1 && n <= 6).map(([n, cost]) => ({ team: n - 1, cost })), win: required(16), lose: required(17), targetCount: required(12), allowedLosses: required(10), bgm: required(19) },
    slots, opening, phases,
  };
  validateMission(model);
  return model;
}

