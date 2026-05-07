import { Node, mergeAttributes } from "@tiptap/core";

export type CalloutVariant = "info" | "warning" | "tip";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    callout: {
      /** Wrap the selection (or insert a paragraph) into a callout block. */
      setCallout: (variant: CalloutVariant) => ReturnType;
      /** Toggle a callout block off. */
      unsetCallout: () => ReturnType;
    };
  }
}

/**
 * Callout block — renders as <blockquote data-callout="info|warning|tip"> in
 * the editor and on the published article. Visual styling lives in CSS
 * (see prose styles in BlogPost.tsx + the editor host).
 */
export const Callout = Node.create({
  name: "callout",
  group: "block",
  content: "block+",
  defining: true,

  addAttributes() {
    return {
      variant: {
        default: "info" as CalloutVariant,
        parseHTML: (el) => el.getAttribute("data-callout") || "info",
        renderHTML: (attrs) => ({ "data-callout": attrs.variant }),
      },
    };
  },

  parseHTML() {
    return [{ tag: "blockquote[data-callout]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["blockquote", mergeAttributes(HTMLAttributes), 0];
  },

  addCommands() {
    return {
      setCallout: (variant) => ({ commands }) =>
        commands.wrapIn(this.name, { variant }),
      unsetCallout: () => ({ commands }) => commands.lift(this.name),
    };
  },
});
