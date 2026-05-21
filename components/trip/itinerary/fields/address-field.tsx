"use client";

/**
 * AddressField — thin wrapper around AddressAutocomplete.
 *
 * W2a swap: replaces the freeform text input with the Places-API-backed
 * autocomplete widget. Preserves the value/onChange/disabled API for
 * backward-compatibility with existing callers, and adds addressPlaceId
 * so the form can persist all three address columns.
 */

import { AddressAutocomplete } from "./address-autocomplete";

export interface AddressFieldProps {
  address: string;
  addressPlaceId?: string;
  onChange: (
    address: string,
    placeId: string | undefined,
    provider: "google" | undefined
  ) => void;
  disabled: boolean;
}

export function AddressField({
  address,
  addressPlaceId,
  onChange,
  disabled,
}: AddressFieldProps) {
  return (
    <AddressAutocomplete
      address={address}
      addressPlaceId={addressPlaceId}
      onChange={onChange}
      disabled={disabled}
    />
  );
}
