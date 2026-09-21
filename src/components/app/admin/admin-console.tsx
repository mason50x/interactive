"use client";

import { api } from "@convex/_generated/api";
import { useAuthedQuery } from "@/lib/use-authed-query";
import { QuotaConsole } from "./quota-console";
import { TimeoutConsole } from "./timeout-console";
import { useAdminEntrance } from "./admin-motion";
import s from "./admin.module.css";

export function AdminConsole() {
  const role = useAuthedQuery(api.timeouts.access, {});
  const intro = useAdminEntrance();
  return (
    <div className={s.workspace}>
      <header id="admin_context" className={s.context} ref={intro}>
        <h1 className={s.title}>Admin</h1>
        <p className={s.description} data-intro>
          Manage access and account controls.
        </p>
        {role === undefined ? (
          <p role="status" className={s.feedback}>
            Checking access…
          </p>
        ) : !role ? (
          <p className={s.feedback}>
            Admin access is restricted to CEOs and Head Moderators.
          </p>
        ) : null}
      </header>
      {role && <TimeoutConsole />}
      {role === "ceo" && <QuotaConsole />}
    </div>
  );
}
