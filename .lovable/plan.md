---
name: Landing Page CTA Update
description: Redirect "Assinar Agora" buttons to the user's WhatsApp number.
type: feature
---

Update the "Assinar Agora" buttons in the pricing section of the landing page to redirect users to the WhatsApp number (19) 9813-6505 with a pre-defined purchase message.

Technical Details:
- Target file: `src/routes/index.tsx`
- Component: `LandingPage`
- Modification: Wrap the "Assinar Agora" `Button` component in an `<a>` tag with the WhatsApp API URL or use `asChild` if not already present.
- URL: `https://wa.me/5519981356505?text=Olá! Gostaria de assinar o plano [NOME_DO_PLANO].`
