
import { Skill } from "../../types";

export const echoSkill: Skill = {
  name: "echo",
  description: "Echoes back the input text.",
  role: "query",
  type: "local",
  params: { text: "The text to echo" },
  execute: async (params: any) => {
    console.log(`[Echo Skill] executing with params:`, params);
    return { echoed: params.text, timestamp: new Date().toISOString() };
  },
  getManual: async () => {
    // In a real implementation, this would read the SKILL.md file
    return `
# Echo Skill

## Description
A simple skill that echoes back the input text. Useful for testing skill invocation and parameter passing.

## Role
query

## Parameters
- text: The text string you want to echo back.

## Usage
Use this skill when you want to verify that the skill system is working, or if the user asks you to "echo" something.
Example:
call_skill("echo", { "text": "Hello World" })
    `;
  }
};
