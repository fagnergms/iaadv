import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

export default auth((req) => {
  if (!req.auth) {
    return NextResponse.redirect(new URL("/login", req.nextUrl.origin));
  }
});

export const config = {
  // `auth()` re-reads the advogado from Postgres on every request (see the jwt
  // callback in src/lib/auth.ts), and Prisma cannot run on the edge runtime.
  runtime: "nodejs",
  matcher: ["/((?!api/auth|login|_next/static|_next/image|favicon.ico).*)"],
};
