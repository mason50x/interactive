"use client";

import { Separator } from "@/components/ui/separator";
import { FaceEditor, type Face } from "@/components/app/chat/face-editor";
import { NameEditor } from "@/components/app/chat/name-editor";
import { MAX_TITLE } from "@/lib/chat";

/**
 * What the group is called and what it looks like, in one section.
 *
 * One heading, because they are one job: a group is named and then given a face
 * to go with the name, usually in the same minute.
 *
 * ## Why the choices are not on the page
 *
 * They were, and it was wrong. Sixteen emoji and twelve colours laid out is
 * twenty-eight controls for a decision that takes two seconds and is made once
 * in the life of a group — a wall of buttons in the middle of a settings sheet,
 * shouting louder than the group's name above it and the people below it.
 *
 * So the disc is the control, and it says so: hover it and a pencil arrives on
 * it, press it and the choices open underneath, one question at a time. That is
 * `FaceEditor`, and it is the same control a person edits their own disc with
 * in the settings panel one click away — which is the whole reason it is a
 * component. A group's face and a person's face are the same object, drawn at
 * the same size out of the same two closed sets, and before this they were two
 * different pieces of UI that agreed about none of it.
 *
 * Beside the disc is what the disc stands for: the name, with a pencil that
 * opens the one field that changes it, and under it how many people are in the
 * room. The count is not a control and is not meant to be — it is the line that
 * makes the name a group's name rather than a word. Both are `name-editor.tsx`,
 * which the person's own handle uses in the settings panel a click away; the
 * note there is the argument for why a name is not a field until it is asked
 * for.
 *
 * The name is saved on a button rather than as you type. Every keystroke
 * through `screenStatic` would be a filter somebody could read a word at a
 * time, which is the thing `src/lib/chat.ts` explains at length; it also means
 * a half-typed name is never the name.
 *
 * `onSet` takes the whole face every time, which is what the mutation takes —
 * see `setLook` in `convex/chat/groups.ts`. The editor sends the face it is
 * holding with one part swapped, and the server drops the letters when an emoji
 * arrives, because the disc has room for one thing.
 */
export function Customization({
  title,
  look,
  members,
  onRename,
  onSet,
}: {
  title: string;
  look: Face;
  /** How many people are in here, said under the name. */
  members: number;
  onRename: (title: string) => Promise<boolean>;
  onSet: (look: Face) => void;
}) {
  return (
    <section>
      <Separator>Customization</Separator>

      <div className="mt-3">
        <FaceEditor
          name={title === "" ? "Group" : title}
          label="the group picture"
          face={look}
          onChange={onSet}
        >
          <div className="flex min-w-0 items-center gap-1">
            <p className="min-w-0 truncate text-[0.9375rem] font-semibold">
              {title}
            </p>

            {/* A refused name is a fact about the field, so it is said in the
                panel the field is in — see `NameEditor`. Nothing out here
                moves for it. */}
            <NameEditor
              value={title}
              label="group name"
              title="Name"
              maxLength={MAX_TITLE}
              onSave={async (wanted) =>
                (await onRename(wanted)) ? null : "That name will not work."
              }
            />
          </div>

          <p className="mt-0.5 truncate text-[0.8125rem] text-muted-foreground">
            {members === 1 ? "Just you in here" : `${members} people in here`}
          </p>
        </FaceEditor>
      </div>
    </section>
  );
}
