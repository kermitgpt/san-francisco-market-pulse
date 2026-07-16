import type { TransferPropertyCategory } from "./types";

export const TRANSFER_CATEGORY_OPTIONS: ReadonlyArray<{
  value: TransferPropertyCategory;
  label: string;
}> = [
  { value: "single-family", label: "Single-family homes" },
  { value: "condo-coop", label: "Condos & co-ops" },
  { value: "townhome", label: "Townhomes" },
  { value: "small-multifamily", label: "Flats & 2–4 units" },
  { value: "apartment-building", label: "Apartment buildings" },
  { value: "other", label: "Other residential" },
];

export function categorizePropertyType(propertyType: string): TransferPropertyCategory {
  const value = propertyType.trim().toLowerCase();

  if (value.includes("town house") || value.includes("townhome")) return "townhome";
  if (value.includes("condominium") || value.includes("coop")) return "condo-coop";
  if (
    value.includes("flats") ||
    value.includes("duplex") ||
    value.includes("4 units or less") ||
    value.includes("apt 4 units") ||
    value.includes("tic bldg") ||
    value.includes("2 dwellings") ||
    value.includes("1 flat")
  ) {
    return "small-multifamily";
  }
  if (
    value.includes("apartment") ||
    value.includes("5 to 14 units") ||
    value.includes("15 units or more") ||
    value.includes("flats 5 to 14")
  ) {
    return "apartment-building";
  }
  if (value === "dwelling") return "single-family";
  return "other";
}
