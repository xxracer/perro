# Caja Simplificada (Vercel Blob)

Libreta de entradas, salidas y ventas para un negocio de comida rápida (perros, hamburguesas, pepitos, bebidas). Diseñada para usarse desde el celular, con letra grande, botones enormes y sin scroll horizontal.

## Requisitos

- Node.js 18 o superior
- Cuenta en Vercel con un store de Vercel Blob

## Variables de entorno

Sube el proyecto a Vercel y configura en el dashboard (Project Settings → Environment Variables):

```env
ADMIN_USERNAME=Admin
ADMIN_PASSWORD=GabyperroAle356
SESSION_SECRET=50f011e95394a7f9268985bc12d22f0a80e0889f77551d018d3e0eb2b5eeb284
BLOB_READ_WRITE_TOKEN=<tu-token-de-vercel-blob>
```

Para desarrollo local, copia `.env.local.example` a `.env.local` y pega tu token de Vercel Blob. `.env.local` está ignorado por git.

## Ejecutar en local

```bash
npm install
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000). Te redirigirá a `/login`.

## Estructura

- `app/page.tsx` — página principal.
- `components/caja-simplificada.tsx` — flujo completo: apertura de día, entradas, salidas, ventas, cierres y subida a Vercel Blob.
- `components/day-section.tsx` — tabla del día y resumen de ventas.
- `lib/days.ts` — tipos y utilidades (días, transacciones, productos, balance).
- `app/api/blob-upload/route.ts` — genera tokens para subir a Vercel Blob.
- `app/api/login/route.ts` — login con rate limiting y bloqueo de IP.
- `app/api/logout/route.ts` — cierra sesión.
- `app/login/page.tsx` — pantalla de acceso.
- `middleware.ts` — protección de rutas.
- `lib/auth.ts` — cookies de sesión firmadas.
- `lib/rate-limit.ts` — limitador en memoria.
- `app/globals.css` — estilos grandes y amigables para celular.

## Funcionalidades

### Días
- **Apertura del día**: seleccionar Viernes, Sábado o Domingo.
- Solo se muestra el día activo. Botón **Cambiar día** para volver al selector.
- **Cerrar día**: genera PDF y JSON del día y los sube a Vercel Blob.
- **Cierre dominical general**: solo visible el domingo, sube el PDF/JSON consolidado del fin de semana.

### Movimientos
- **Entrada**: con método de pago Efectivo o Pago Móvil. Pago Móvil requiere número de referencia bancaria.
- **Salida**: requiere motivo del gasto.
- **Venta**: selector de producto (Perro, Hamburguesa, Pepito, Malta, Refresco, Cerveza), cantidad y monto total.
  - Si se vende **Hamburguesa**, se puede escribir el tipo (ej. "de chuleta").
- IDs auto-generados secuencialmente (`001`, `002`, ...).

### Resumen de ventas
- Debajo del formulario aparece un cuadrito con las cantidades vendidas de cada producto:
  - Perros · Hamburguesas · Pepitos · Maltas · Refrescos · Cervezas

### Seguridad
- Login con sesión firmada.
- Rate limiting: 5 intentos fallidos en 10 minutos bloquean la IP durante 30 minutos.
- Token de Vercel Blob solo se usa en el servidor.

## Uso en celular

La interfaz está optimizada para pantallas pequeñas:
- Botones de ancho completo y altura grande.
- Selectores de tipo y producto con radios grandes.
- Tabla que cabe en la pantalla sin scroll horizontal.
- Texto grande y alto contraste.
