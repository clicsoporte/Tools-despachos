/**
 * @fileoverview A reusable component for displaying a "tool" card on the dashboard.
 * Each card acts as a link to a specific feature or section of the application.
 * It is designed to be clickable and visually represent a tool with an icon and description.
 */

import Link from "next/link";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import type { Tool } from "@/modules/core/types";
import { cn } from "@/lib/utils";


interface ToolCardProps {
  tool: Tool;
  badgeCount?: number;
}

/**
 * Renders a single tool card.
 * The entire card is a clickable link that navigates to the tool's specified `href`.
 * It displays an icon, name, and description for the tool.
 * @param {ToolCardProps} props - The properties for the component.
 * @param {Tool} props.tool - The tool data object to render.
 * @returns {JSX.Element} A link-wrapped card component.
 */
export function ToolCard({ tool, badgeCount = 0 }: ToolCardProps) {
  const Icon = tool.icon;
  return (
    <Link href={tool.href} className="block h-full">
      <Card className="group h-full transform transition-all duration-300 hover:-translate-y-1 hover:shadow-xl relative">
        {badgeCount > 0 && (
          <div className="absolute top-2 right-2 flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-xs font-bold text-white">
            {badgeCount}
          </div>
        )}
        <CardHeader className="grid grid-cols-[auto_1fr] items-center gap-4">
          {Icon && (
            <div
              className={cn(
                "flex h-12 w-12 items-center justify-center rounded-lg shrink-0",
                tool.bgColor || "bg-primary"
              )}
            >
               <Icon className="h-6 w-6 text-white" />
            </div>
          )}
          <div className="text-left">
            <CardTitle className="text-lg">{tool.name}</CardTitle>
            <CardDescription className="line-clamp-2">{tool.description}</CardDescription>
          </div>
        </CardHeader>
      </Card>
    </Link>
  );
}
