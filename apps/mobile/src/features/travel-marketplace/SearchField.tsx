import React from "react";
import { TextInput, View, type TextInputProps } from "react-native";
import { Label } from "../../components/Type.tsx";
import { color } from "../../theme/index.ts";

/** Persistent visible label; web presentation floats it inside the input. */
export function SearchField({
  label,
  ...input
}: TextInputProps & { label: string }) {
  return (
    <View testID="travel-field" style={{ gap: 8, minWidth: 0 }}>
      <View testID="travel-field-label">
        <Label size={10} colour={color.neutral700}>
          {label}
        </Label>
      </View>
      <TextInput
        {...input}
        style={{
          borderWidth: 1,
          borderColor: color.neutral300,
          borderRadius: 16,
          padding: 14,
          minHeight: 60,
          color: color.text,
          fontSize: 14,
        }}
      />
    </View>
  );
}
