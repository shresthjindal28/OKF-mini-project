"use client";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cn } from "@/lib/utils";
import type { ComponentProps } from "react";
export const Tabs = TabsPrimitive.Root;
export function TabsList(props: ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      {...props}
      className={cn("tabs-list", props.className)}
    />
  );
}
export function TabsTrigger(
  props: ComponentProps<typeof TabsPrimitive.Trigger>,
) {
  return (
    <TabsPrimitive.Trigger
      {...props}
      className={cn("tabs-trigger", props.className)}
    />
  );
}
export function TabsContent(
  props: ComponentProps<typeof TabsPrimitive.Content>,
) {
  return (
    <TabsPrimitive.Content
      {...props}
      className={cn("tabs-content", props.className)}
    />
  );
}
