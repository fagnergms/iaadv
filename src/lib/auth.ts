import NextAuth, { type DefaultSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { verifyCredentials, getAdvogadoAtivoById } from "./credentials";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      isAdmin: boolean;
    } & DefaultSession["user"];
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      authorize: async (credentials) => {
        const email = credentials?.email as string | undefined;
        const password = credentials?.password as string | undefined;
        if (!email || !password) return null;
        return verifyCredentials(email, password);
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = (user as { id: string }).id;
        token.isAdmin = (user as { isAdmin: boolean }).isAdmin;
        return token;
      }

      // Every subsequent request: re-read the account so a deactivation (or an
      // isAdmin change) takes effect within one request instead of lingering
      // until the JWT expires. Returning null makes Auth.js drop the session
      // cookie and report the request as unauthenticated.
      const id = token.id;
      if (typeof id !== "string") return null;

      const advogado = await getAdvogadoAtivoById(id);
      if (!advogado) return null;

      token.isAdmin = advogado.isAdmin;
      return token;
    },
    session({ session, token }) {
      session.user.id = token.id as string;
      session.user.isAdmin = token.isAdmin as boolean;
      return session;
    },
  },
});
