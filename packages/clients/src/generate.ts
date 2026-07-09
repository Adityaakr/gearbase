import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

type RoomIdlDefinition = {
  template: string;
  idl: string;
  programName: string;
  serviceName: string;
};

const currentDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(currentDir, "../../..");
const programsDir = join(repoRoot, "programs");
const generatedPath = join(currentDir, "generated.ts");

function parseProgramName(idl: string): string {
  const match = idl.match(/program\s+([A-Za-z0-9_]+)/);
  if (!match) {
    throw new Error("Unable to parse program name from IDL");
  }

  return match[1];
}

function parseServiceName(idl: string): string {
  const match = idl.match(/service\s+([A-Za-z0-9_]+)@/);
  if (!match) {
    throw new Error("Unable to parse service name from IDL");
  }

  return match[1];
}

async function collectRoomIdls(): Promise<RoomIdlDefinition[]> {
  const entries = await readdir(programsDir, { withFileTypes: true });
  const roomDirs = entries
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("room-"))
    .map((entry) => entry.name)
    .sort();

  const definitions: RoomIdlDefinition[] = [];

  for (const roomDir of roomDirs) {
    const template = roomDir.slice("room-".length);
    const clientDir = join(programsDir, roomDir, "client");
    const clientEntries = await readdir(clientDir, { withFileTypes: true });
    const idlEntry = clientEntries.find(
      (entry) => entry.isFile() && entry.name.endsWith(".idl"),
    );

    if (!idlEntry) {
      continue;
    }

    const idl = await readFile(join(clientDir, idlEntry.name), "utf8");
    definitions.push({
      template,
      idl,
      programName: parseProgramName(idl),
      serviceName: parseServiceName(idl),
    });
  }

  return definitions;
}

function renderGeneratedModule(definitions: RoomIdlDefinition[]): string {
  const entries = definitions
    .map(
      (definition) => `  ${JSON.stringify(definition.template)}: {
    programName: ${JSON.stringify(definition.programName)},
    serviceName: ${JSON.stringify(definition.serviceName)},
    idl: ${JSON.stringify(definition.idl)},
  },`,
    )
    .join("\n");

  return `export const generatedRoomIdls = {
${entries}
} as const;

export type GeneratedRoomTemplate = keyof typeof generatedRoomIdls;
`;
}

async function main() {
  const definitions = await collectRoomIdls();
  if (definitions.length === 0) {
    throw new Error("No room IDLs found under programs/*/client");
  }

  await mkdir(dirname(generatedPath), { recursive: true });
  await writeFile(generatedPath, renderGeneratedModule(definitions));
  console.log(`generated ${definitions.length} room IDL definition(s)`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
