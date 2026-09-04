import { describe, it, expect } from "vitest";
import {
  insertOwnerSchema,
  insertPatientSchema,
  insertInventoryItemSchema,
} from "@shared/schema";

describe("insertOwnerSchema", () => {
  it("accepts a valid owner", () => {
    expect(
      insertOwnerSchema.safeParse({ firstName: "Ana", lastName: "López" }).success
    ).toBe(true);
  });

  it("rejects an owner missing lastName", () => {
    expect(insertOwnerSchema.safeParse({ firstName: "Ana" }).success).toBe(false);
  });
});

describe("insertPatientSchema", () => {
  it("accepts a valid patient", () => {
    expect(
      insertPatientSchema.safeParse({
        name: "Rocky",
        species: "perro",
        ownerId: "11111111-1111-1111-1111-111111111111",
      }).success
    ).toBe(true);
  });

  it("rejects a patient without species", () => {
    expect(
      insertPatientSchema.safeParse({
        name: "Rocky",
        ownerId: "11111111-1111-1111-1111-111111111111",
      }).success
    ).toBe(false);
  });

  it("rejects a patient without an owner", () => {
    expect(
      insertPatientSchema.safeParse({ name: "Rocky", species: "perro" }).success
    ).toBe(false);
  });
});

describe("insertInventoryItemSchema", () => {
  it("accepts an item with only a name", () => {
    expect(
      insertInventoryItemSchema.safeParse({ name: "Vacuna Quíntuple" }).success
    ).toBe(true);
  });

  it("rejects an item without a name", () => {
    expect(
      insertInventoryItemSchema.safeParse({ category: "vacunas" }).success
    ).toBe(false);
  });
});
