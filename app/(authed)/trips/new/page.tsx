/**
 * `/trips/new` — trip creation page.
 *
 * Server Component. Renders a centered card with the client-side
 * `<TripForm />`. The authed gate runs in the parent `(authed)/layout.tsx`,
 * so by the time we hit this page the user is signed in.
 */

import type { Metadata } from "next";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { TripForm } from "./_form";

export const metadata: Metadata = {
  title: "Start a trip — Bachelor Party Planner",
};

export default function NewTripPage() {
  return (
    <section className="mx-auto w-full max-w-md px-4 py-6">
      <Card>
        <CardHeader>
          <CardTitle>
            <h1 className="text-lg font-medium">Start a trip</h1>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <TripForm />
        </CardContent>
      </Card>
    </section>
  );
}
