"use client";
import { useFormContext } from "react-hook-form";
import { z } from "zod";
import { documentTypes } from "@/lib/documents";
import {
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from "@/components/ui/form";
export const metadataSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Give your document a title.")
    .max(120, "Use 120 characters or fewer."),
  description: z.string().trim().max(500, "Use 500 characters or fewer."),
  author: z.string().trim().max(80, "Use 80 characters or fewer."),
  documentType: z.enum(documentTypes, { error: "Choose a document type." }),
  tags: z
    .string()
    .refine(
      (v) =>
        v.trim() === "" ||
        (v.split(",").length <= 8 &&
          v
            .split(",")
            .every((t) => /^[a-zA-Z0-9][a-zA-Z0-9 -]{0,23}$/.test(t.trim()))),
      "Add up to 8 comma-separated tags, 1–24 letters, numbers, spaces, or hyphens each.",
    ),
});
export type MetadataValues = z.infer<typeof metadataSchema>;
export function MetadataForm() {
  const { control, watch } = useFormContext<MetadataValues>();
  const description = watch("description");
  return (
    <div className="metadata-fields">
      <FormField
        control={control}
        name="title"
        render={({ field }) => (
          <FormItem>
            <FormLabel>
              Document title <span className="required">*</span>
            </FormLabel>
            <FormControl>
              <input
                placeholder="Give your document a clear, descriptive title"
                {...field}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={control}
        name="description"
        render={({ field }) => (
          <FormItem>
            <FormLabel>
              Description <span className="optional">Optional</span>
            </FormLabel>
            <FormControl>
              <textarea
                rows={3}
                placeholder="What is this document about?"
                {...field}
              />
            </FormControl>
            <div className="field-help">
              A short summary to help you find it later.
              <span>{description.length}/500</span>
            </div>
            <FormMessage />
          </FormItem>
        )}
      />
      <div className="form-two-col">
        <FormField
          control={control}
          name="author"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                Author <span className="optional">Optional</span>
              </FormLabel>
              <FormControl>
                <input placeholder="e.g. Alex Morgan" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={control}
          name="documentType"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                Document type <span className="required">*</span>
              </FormLabel>
              <FormControl>
                <select {...field}>
                  <option value="">Select a type</option>
                  {documentTypes.map((type) => (
                    <option key={type}>{type}</option>
                  ))}
                </select>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
      <FormField
        control={control}
        name="tags"
        render={({ field }) => (
          <FormItem>
            <FormLabel>
              Tags <span className="optional">Optional</span>
            </FormLabel>
            <FormControl>
              <input
                placeholder="e.g. documentation, engineering, getting-started"
                {...field}
              />
            </FormControl>
            <p className="field-help">
              Separate tags with commas. Add up to 8 tags.
            </p>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  );
}
