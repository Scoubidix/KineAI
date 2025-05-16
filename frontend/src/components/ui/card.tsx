import * as React from "react"
import { Slot } from "@radix-ui/react-slot"; // Import Slot

import { cn } from "@/lib/utils"

// Updated Card component with subtle shadow and theme variables
const Card = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "rounded-lg border border-border bg-card text-card-foreground shadow-sm", // Use theme vars, kept subtle shadow
      className
    )}
    {...props}
  />
))
Card.displayName = "Card"

const CardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex flex-col space-y-1.5 p-4 md:p-6", className)} // Adjusted padding
    {...props}
  />
))
CardHeader.displayName = "CardHeader"

// Updated CardTitle - slightly smaller, less bold, allow 'as' prop
const CardTitle = React.forwardRef<
  HTMLHeadingElement, // Default to h3
  React.HTMLAttributes<HTMLHeadingElement> & { asChild?: boolean } // Add asChild prop
>(({ className, asChild, ...props }, ref) => {
    const Comp = asChild ? Slot : "h3"; // Default to h3, use Slot if asChild is true
    return (
      <Comp
        ref={ref}
        className={cn(
          "text-lg font-semibold leading-none tracking-tight", // Adjusted size and weight
          className
        )}
        {...props}
      />
    )
})
CardTitle.displayName = "CardTitle"

// Updated CardDescription - allow 'as' prop
const CardDescription = React.forwardRef<
  HTMLParagraphElement, // Default to p
  React.HTMLAttributes<HTMLParagraphElement> & { asChild?: boolean } // Add asChild prop
>(({ className, asChild, ...props }, ref) => {
    const Comp = asChild ? Slot : "p"; // Default to p, use Slot if asChild is true
    return (
      <Comp
        ref={ref}
        className={cn("text-sm text-muted-foreground", className)}
        {...props}
      />
    )
})
CardDescription.displayName = "CardDescription"

const CardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("p-4 md:p-6 pt-0", className)} {...props} /> // Adjusted padding
))
CardContent.displayName = "CardContent"

const CardFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex items-center p-4 md:p-6 pt-0", className)} // Adjusted padding
    {...props}
  />
))
CardFooter.displayName = "CardFooter"

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent }
