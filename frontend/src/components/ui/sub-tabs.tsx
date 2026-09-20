"use client"

// Navigation de niveau 2 : onglets soulignés, volontairement différents des pilules du niveau 1
// (TabsList est déjà un segmented control — deux rangées identiques = anti-pattern « nested tabs »).
// À utiliser à l'intérieur d'un <Tabs> de tabs.tsx, avec des <TabsContent> du même module.
import * as React from "react"
import * as TabsPrimitive from "@radix-ui/react-tabs"

import { cn } from "@/lib/utils"

const SubTabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      "inline-flex h-auto w-full items-center justify-start gap-6 border-b border-border bg-transparent p-0 text-muted-foreground",
      className
    )}
    {...props}
  />
))
SubTabsList.displayName = "SubTabsList"

const SubTabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      "inline-flex items-center gap-1.5 whitespace-nowrap border-b-2 border-transparent px-1 pb-2 pt-1 text-sm font-medium transition-colors",
      "ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      "hover:text-foreground disabled:pointer-events-none disabled:opacity-50",
      "data-[state=active]:border-primary data-[state=active]:text-foreground",
      className
    )}
    {...props}
  />
))
SubTabsTrigger.displayName = "SubTabsTrigger"

export { SubTabsList, SubTabsTrigger }
