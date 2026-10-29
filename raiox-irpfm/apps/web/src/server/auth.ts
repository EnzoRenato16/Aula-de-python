import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { organization } from "better-auth/plugins";
import { and, eq } from "drizzle-orm";
import { db } from "./db/index.ts";
import * as schema from "./db/schema.ts";
import { env } from "./env.ts";

const DAY = 60 * 60 * 24;

/**
 * Additional fields: a member of role "member" (shown as "Assessor") is linked
 * to the clients whose codigo_assessor equals advisorCode. Invitations carry
 * the code so it is set when the invitation is accepted.
 */
const advisorCodeField = { advisorCode: { type: "string", required: false, input: true } } as const;

function createAuth() {
  return betterAuth({
    appName: "Raio-X IRPFM",
    baseURL: env().BETTER_AUTH_URL,
    secret: env().BETTER_AUTH_SECRET,
    database: drizzleAdapter(db(), { provider: "pg", schema }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 10,
      autoSignIn: true,
    },
    session: { expiresIn: 7 * DAY, updateAge: DAY },
    rateLimit: {
      enabled: true,
      window: 60,
      max: 100,
      customRules: {
        "/sign-in/email": { window: 60, max: 5 },
        "/sign-up/email": { window: 60, max: 3 },
      },
    },
    plugins: [
      organization({
        allowUserToCreateOrganization: true,
        organizationLimit: 3,
        creatorRole: "owner",
        invitationExpiresIn: 7 * DAY,
        cancelPendingInvitationsOnReInvite: true,
        schema: {
          member: { additionalFields: advisorCodeField },
          invitation: { additionalFields: advisorCodeField },
        },
        organizationHooks: {
          afterAcceptInvitation: async ({ invitation, member }) => {
            const advisorCode = (invitation as { advisorCode?: string | null }).advisorCode;
            if (!advisorCode) return;
            await db()
              .update(schema.member)
              .set({ advisorCode })
              .where(
                and(
                  eq(schema.member.id, member.id),
                  eq(schema.member.organizationId, invitation.organizationId),
                ),
              );
          },
        },
      }),
      // Must be last: lets server actions set the session cookie.
      nextCookies(),
    ],
  });
}

type Auth = ReturnType<typeof createAuth>;
const globalForAuth = globalThis as unknown as { raioxAuth?: Auth };

/** Lazily created so `next build` does not require runtime secrets. */
export function auth(): Auth {
  globalForAuth.raioxAuth ??= createAuth();
  return globalForAuth.raioxAuth;
}
