"use client";
import * as React from "react";
import * as LabelPrimitive from "@radix-ui/react-label";
import {
  Controller,
  FormProvider,
  useFormContext,
  type ControllerProps,
  type FieldPath,
  type FieldValues,
} from "react-hook-form";
import { Slot } from "@radix-ui/react-slot";
const FieldContext = React.createContext<{ name: string }>({ name: "" });
const ItemContext = React.createContext<{ id: string }>({ id: "" });
export const Form = FormProvider;
export function FormField<T extends FieldValues, N extends FieldPath<T>>(
  props: ControllerProps<T, N>,
) {
  return (
    <FieldContext.Provider value={{ name: props.name }}>
      <Controller {...props} />
    </FieldContext.Provider>
  );
}
export function FormItem({ children }: { children: React.ReactNode }) {
  const id = React.useId();
  return (
    <ItemContext.Provider value={{ id }}>
      <div className="form-item">{children}</div>
    </ItemContext.Provider>
  );
}
function useField() {
  const { name } = React.useContext(FieldContext);
  const { id } = React.useContext(ItemContext);
  const { getFieldState, formState } = useFormContext();
  return { id, ...getFieldState(name, formState) };
}
export function FormLabel(
  props: React.ComponentProps<typeof LabelPrimitive.Root>,
) {
  const { id } = useField();
  return <LabelPrimitive.Root htmlFor={id} className="form-label" {...props} />;
}
export function FormControl(props: React.ComponentProps<typeof Slot>) {
  const { id, error } = useField();
  return (
    <Slot
      id={id}
      aria-invalid={!!error}
      aria-describedby={error ? `${id}-error` : undefined}
      {...props}
    />
  );
}
export function FormMessage() {
  const { id, error } = useField();
  return error ? (
    <p id={`${id}-error`} className="field-error">
      {String(error.message)}
    </p>
  ) : null;
}
