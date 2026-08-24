# Vercel build fix

The project uses the Tailwind CSS 3 configuration already present in this project.
`tailwindcss` is pinned to `^3.4.17` so Vercel does not install Tailwind CSS 4, which requires a different PostCSS plugin/configuration.

No Supabase configuration was changed.
