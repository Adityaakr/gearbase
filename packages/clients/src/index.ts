import { SailsProgram } from "sails-js";
import { SailsIdlParser } from "sails-js/parser";
import type { Address } from "viem";

import { generatedRoomIdls, type GeneratedRoomTemplate } from "./generated";

export type SupportedRoomTemplate = GeneratedRoomTemplate;

export type GeneratedRoomClient = {
  template: SupportedRoomTemplate;
  programName: string;
  serviceName: string;
  idl: string;
};

const generatedClients = Object.entries(generatedRoomIdls).map(
  ([template, definition]) =>
    ({
      template: template as SupportedRoomTemplate,
      programName: definition.programName,
      serviceName: definition.serviceName,
      idl: definition.idl,
    }) satisfies GeneratedRoomClient,
);

let parserPromise: Promise<SailsIdlParser> | undefined;

async function getParser(): Promise<SailsIdlParser> {
  if (!parserPromise) {
    parserPromise = (async () => {
      const parser = new SailsIdlParser();
      await parser.init();
      return parser;
    })();
  }

  return parserPromise;
}

export function listGeneratedClients(): GeneratedRoomClient[] {
  return generatedClients;
}

export function isSupportedRoomTemplate(template: string): template is SupportedRoomTemplate {
  return template in generatedRoomIdls;
}

export async function loadRoomProgram(
  template: SupportedRoomTemplate,
  programId?: Address,
): Promise<SailsProgram> {
  const parser = await getParser();
  const definition = generatedRoomIdls[template];
  const doc = parser.parse(definition.idl);
  const program = new SailsProgram(doc);

  if (programId) {
    program.setProgramId(programId);
  }

  return program;
}

export async function loadRoomProgramByTemplateName(
  template: string,
  programId?: Address,
): Promise<SailsProgram> {
  if (!isSupportedRoomTemplate(template)) {
    throw new Error(`Unsupported Gearbase room template: ${template}`);
  }

  return loadRoomProgram(template, programId);
}
