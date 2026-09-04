// TS 7 (catalog typescript) reports TS2882 for the side-effect import of
// ./globals.css in app/layout.tsx. Ambient shim, standard Next practice.
declare module '*.css'
