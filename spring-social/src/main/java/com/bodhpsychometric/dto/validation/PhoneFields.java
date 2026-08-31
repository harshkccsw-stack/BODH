package com.bodhpsychometric.dto.validation;

/**
 * The two halves of a phone number, so {@link E164Phone} can check them
 * TOGETHER without reflecting over field names.
 *
 * <p>Implemented by the request records themselves — a record's component
 * accessors already have these signatures, so declaring the interface costs
 * nothing and makes the cross-field constraint type-safe.
 */
public interface PhoneFields {

    /** Dial code with the '+', e.g. "+91". */
    String phoneCountryCode();

    /** National number, digits only. */
    String phone();
}
