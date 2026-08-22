# Cuentas del viaje

App para repartir gastos compartidos entre amigos en un viaje. Sin login: cada
viaje se crea con un código único y ese link es lo que se comparte con el grupo.

## Stack
- Frontend: HTML + JS plano (`index.html`)
- Backend: función serverless de Node en Vercel (`api/viaje.js`)
- Base de datos: Turso (SQLite remoto)

## Despliegue

### 1. Crear la base de datos en Turso
```
curl -sSfL https://get.tur.so/install.sh | bash
turso auth signup
turso db create cuentas-viaje
turso db show cuentas-viaje --url
turso db tokens create cuentas-viaje
```
Guarda la URL y el token: son las variables `TURSO_DATABASE_URL` y `TURSO_AUTH_TOKEN`.

### 2. Subir el proyecto a GitHub
```
cd cuentas-viaje
git init
git add .
git commit -m "primera version"
```
Crea un repo en GitHub y haz push.

### 3. Desplegar en Vercel
- Entra en vercel.com, "Add New Project", importa el repo.
- En "Environment Variables" añade:
  - `TURSO_DATABASE_URL`
  - `TURSO_AUTH_TOKEN`
- Deploy.

Con eso, cualquiera que entre a tu dominio de Vercel puede pulsar "Crear viaje" y
generar el suyo propio, independiente de los demás.
