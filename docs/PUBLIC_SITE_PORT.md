# Porting the Sohoj Academy public website

Source: `AbdusSattar-70/sohoj-academy` at `feature/sohoj_final`.
Destination: this repository, branch `feature/public_site_port`.

## Already copied as source code

- Homepage layout and sections: `modules/home/page-content.tsx`
- Navbar, logo React component, language controls, locale provider and text
- Original `modules/home/program-section.tsx` component design
- Original `app/globals.css` design tokens
- Landing route and bilingual fonts

## Must copy binary assets locally

GitHub's text-file integration cannot copy these WebP binary files. Without them
the hero image, learning-method image and logo will be missing. In your Sohojac
clone, with the original repo available alongside it:

```bash
cd ~/all-projects/sohojac
git fetch origin
git switch feature/public_site_port 2>/dev/null || git switch --track origin/feature/public_site_port
git pull --ff-only origin feature/public_site_port

mkdir -p public/images public/branding
cp ../sohoj-academy/public/images/sohoj-classroom.webp public/images/
cp ../sohoj-academy/public/images/sohoj-learning.webp public/images/
cp ../sohoj-academy/public/branding/sohoj-academy-logo.webp public/branding/
cp ../sohoj-academy/public/branding/sohoj-academy-mark.webp public/branding/
git add public/images/sohoj-classroom.webp public/images/sohoj-learning.webp public/branding/sohoj-academy-logo.webp public/branding/sohoj-academy-mark.webp
git commit -m "assets(public): restore original Sohoj Academy photos and logo"
git push -u origin feature/public_site_port

pnpm install
pnpm run build
pnpm run dev
```

If the old clone isn't in `../sohoj-academy`, point `cp` at its actual path
or clone the old repository locally. Copy other favicon and branding assets
later when needed.

## Intentionally not yet equivalent

The original public programme section reads from **Supabase** using an RPC.
In this new app, `modules/offerings/queries.ts` deliberately returns an empty
published-programme collection until the **Cloudflare D1** equivalent exists.
It does not pretend programmes are published. This means the **programme-card
visuals are preserved in source but no cards display yet**.

Other public routes linked from the original homepage — `/interest`, `/about`,
`/faq`, `/journal` — also need porting individually; links presently point to
these future routes. No form submissions are connected to D1 yet.

The old site used a theme provider that forced dark mode. The new layout adds
a dark class and keeps the original CSS tokens but still needs visual QA.
Authentication stays on the separate `feature/better_auth` branch ancestry;
we are **not** doing D1 auth setup as part of this visual migration.

Do not deploy this as a complete public website until linked routes, assets,
programme catalogue, SEO metadata and accessibility/mobile visual comparisons
pass.
