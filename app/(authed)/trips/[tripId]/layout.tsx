/**
 * Layout for all authed trip routes: `/trips/[tripId]` and everything beneath.
 *
 * M4 W0d: wraps children with the BottomTabBar so every trip sub-route
 * gets the bottom navigation. The tab bar is a client component that infers
 * the active tab from `usePathname()`.
 *
 * `tripId` here is the trip slug (same naming convention as the page.tsx
 * siblings — the param is named `tripId` but contains the slug value).
 *
 * Adds `pb-[60px]` to main so content is not obscured by the fixed tab bar.
 */

import { BottomTabBar } from "@/components/nav/BottomTabBar";

type LayoutProps = {
  children: React.ReactNode;
  params: Promise<{ tripId: string }>;
};

export default async function TripLayout({ children, params }: LayoutProps) {
  const { tripId } = await params;

  return (
    <>
      {/* pb-[60px] offsets the fixed BottomTabBar so content isn't clipped */}
      <div className="pb-[60px]">{children}</div>
      <BottomTabBar tripId={tripId} />
    </>
  );
}
