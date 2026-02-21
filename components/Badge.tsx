import React from "react";
import { BadgeProps } from "../types";

export default function Badge({ type = "gray", children, style = {} }: BadgeProps) {
    const colors: Record<string, string> = {
        green: "badge-green",
        red: "badge-red",
        amber: "badge-amber",
        blue: "badge-blue",
        purple: "badge-purple",
        gray: "badge-gray",
        orange: "badge-orange",
    };
    const cls = colors[type] || colors.gray;
    return (
        <span className={`badge ${cls}`} style={style}>
            {children}
        </span>
    );
}
