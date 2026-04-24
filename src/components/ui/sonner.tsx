"use client"

import { Toaster as Sonner, ToasterProps } from "sonner"

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="dark"
      dir="rtl"
      position="top-center"
      richColors
      className="toaster group"
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
        } as React.CSSProperties
      }
      toastOptions={{
        style: {
          fontFamily: "inherit",
          borderRadius: "16px",
          border: "1px solid rgba(255,255,255,0.06)",
          backdropFilter: "blur(20px)",
          fontSize: "13px",
          padding: "14px 18px",
        },
        classNames: {
          toast: "!shadow-2xl",
          title: "!text-[13px] !font-bold",
          description: "!text-[11px] !text-muted-foreground !mt-0.5",
          success: "!border-emerald-500/20 !bg-emerald-500/[0.07]",
          error: "!border-red-500/20 !bg-red-500/[0.07]",
          warning: "!border-amber-500/20 !bg-amber-500/[0.07]",
          info: "!border-sky-500/20 !bg-sky-500/[0.07]",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
