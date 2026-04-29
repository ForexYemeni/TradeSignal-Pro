import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";

const config: Config = {
    darkMode: "class",
    content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
        extend: {
                colors: {
                        background: 'hsl(var(--background))',
                        foreground: 'hsl(var(--foreground))',
                        card: {
                                DEFAULT: 'hsl(var(--card))',
                                foreground: 'hsl(var(--card-foreground))'
                        },
                        popover: {
                                DEFAULT: 'hsl(var(--popover))',
                                foreground: 'hsl(var(--popover-foreground))'
                        },
                        primary: {
                                DEFAULT: 'hsl(var(--primary))',
                                foreground: 'hsl(var(--primary-foreground))'
                        },
                        secondary: {
                                DEFAULT: 'hsl(var(--secondary))',
                                foreground: 'hsl(var(--secondary-foreground))'
                        },
                        muted: {
                                DEFAULT: 'hsl(var(--muted))',
                                foreground: 'hsl(var(--muted-foreground))'
                        },
                        accent: {
                                DEFAULT: 'hsl(var(--accent))',
                                foreground: 'hsl(var(--accent-foreground))'
                        },
                        destructive: {
                                DEFAULT: 'hsl(var(--destructive))',
                                foreground: 'hsl(var(--destructive-foreground))'
                        },
                        border: 'hsl(var(--border))',
                        input: 'hsl(var(--input))',
                        ring: 'hsl(var(--ring))',
                        chart: {
                                '1': 'hsl(var(--chart-1))',
                                '2': 'hsl(var(--chart-2))',
                                '3': 'hsl(var(--chart-3))',
                                '4': 'hsl(var(--chart-4))',
                                '5': 'hsl(var(--chart-5))'
                        },
                        /* ── Design System Tokens ── */
                        navy: {
                                900: 'var(--ds-navy-900)',
                                800: 'var(--ds-navy-800)',
                                700: 'var(--ds-navy-700)',
                                600: 'var(--ds-navy-600)',
                        },
                        gold: {
                                DEFAULT: 'var(--ds-gold-start)',
                                400: 'var(--ds-gold-start)',
                                500: '#FFC107',
                                600: 'var(--ds-gold-end)',
                        },
                        success: {
                                DEFAULT: 'var(--ds-success)',
                                light: 'var(--ds-success-light)',
                        },
                        danger: {
                                DEFAULT: 'var(--ds-danger)',
                                light: 'var(--ds-danger-light)',
                        },
                        info: 'var(--ds-info)',
                        vip: {
                                DEFAULT: 'var(--ds-vip)',
                                light: 'var(--ds-vip-light)',
                        },
                },
                borderRadius: {
                        xs: '0.375rem',   /* 6px — badges, small pills */
                        sm: '0.5rem',     /* 8px — inputs, buttons */
                        md: '0.75rem',    /* 12px — cards, containers */
                        lg: '1rem',       /* 16px — large cards, modals */
                        xl: '1.25rem',    /* 20px — hero sections */
                        '2xl': '1.5rem',  /* 24px — special elements */
                },
                maxWidth: {
                        app: '28rem',     /* 448px — mobile container */
                        tablet: '42rem',  /* 672px — tablet */
                        desktop: '64rem', /* 1024px — desktop */
                },
                boxShadow: {
                        layered: '0 1px 2px rgba(0,0,0,0.15), 0 4px 12px rgba(0,0,0,0.2), 0 12px 40px rgba(0,0,0,0.3)',
                        'layered-lg': '0 2px 4px rgba(0,0,0,0.15), 0 8px 20px rgba(0,0,0,0.25), 0 20px 60px rgba(0,0,0,0.35)',
                        gold: '0 0 20px rgba(255,215,0,0.15), 0 0 40px rgba(255,215,0,0.05)',
                        'gold-lg': '0 0 40px rgba(255,215,0,0.12), 0 0 80px rgba(255,215,0,0.04)',
                },
                backgroundImage: {
                        'gold-gradient': 'linear-gradient(135deg, #FFD700 0%, #FF8F00 100%)',
                        'gold-shimmer': 'linear-gradient(90deg, #FFD700 0%, #FF8F00 50%, #FFD700 100%)',
                },
        }
  },
  plugins: [tailwindcssAnimate],
};
export default config;
