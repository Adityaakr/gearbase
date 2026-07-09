import { describe, it, expect } from "vitest";

import {
  isSupportedRoomTemplate,
  listGeneratedClients,
  loadRoomProgramByTemplateName,
} from "../src/index";

describe("isSupportedRoomTemplate", () => {
  it("accepts the three generated templates", () => {
    expect(isSupportedRoomTemplate("canvas")).toBe(true);
    expect(isSupportedRoomTemplate("poll")).toBe(true);
    expect(isSupportedRoomTemplate("fth")).toBe(true);
  });

  it("rejects unknown template names", () => {
    expect(isSupportedRoomTemplate("chess")).toBe(false);
    expect(isSupportedRoomTemplate("")).toBe(false);
    expect(isSupportedRoomTemplate("Canvas")).toBe(false); // case-sensitive
  });
});

describe("listGeneratedClients", () => {
  it("lists exactly the generated room clients with their metadata", () => {
    const clients = listGeneratedClients();
    const byTemplate = Object.fromEntries(clients.map((c) => [c.template, c]));

    expect(clients.map((c) => c.template).sort()).toEqual(["canvas", "fth", "poll"]);
    expect(byTemplate.canvas.programName).toBe("RoomCanvasClient");
    expect(byTemplate.poll.programName).toBe("RoomPollClient");
    expect(byTemplate.fth.programName).toBe("RoomFthClient");
    for (const client of clients) {
      expect(client.serviceName).toBe("Room");
      expect(client.idl).toContain("service Room");
    }
  });
});

describe("loadRoomProgramByTemplateName", () => {
  it("rejects an unknown template before touching the parser", async () => {
    await expect(loadRoomProgramByTemplateName("nope")).rejects.toThrow(
      /Unsupported Gearbase room template: nope/,
    );
  });

  it("loads a known template into a SailsProgram", async () => {
    const program = await loadRoomProgramByTemplateName("canvas");
    expect(program).toBeDefined();
    // The Room service should be present on the parsed program.
    expect((program.services as Record<string, unknown>).Room).toBeDefined();
  });
});
