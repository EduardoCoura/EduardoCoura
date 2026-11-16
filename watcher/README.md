# Profile City Watcher (Cloudflare Worker)

Monitora automaticamente toda a sua conta do GitHub a cada **5 minutos** (plano grátis do Cloudflare Workers) e dispara o workflow do perfil assim que detecta:

- Push em qualquer repositório (público ou privado, atual ou criado no futuro)
- Criação de repositório/branch/tag, PR, release ou issue
- Mudança no total de contribuições/repositórios do gráfico
- Transição dia/noite (`06:00` e `18:00` em `America/Sao_Paulo`)

Também expõe `POST /webhook` caso você queira conectar um GitHub App futuramente para disparos em < 1 segundo.

## Setup único (1 minuto)

Execute no PowerShell:

```powershell
./watcher/setup.ps1
```

O script vai:
1. Pedir seu GitHub PAT (`repo`, `workflow`, `read:user`) com entrada oculta.
2. Salvar `PROFILE_TOKEN` como secret nos repositórios do GitHub.
3. Fazer `wrangler login` (se ainda não estiver autenticado), publicar o Worker e salvar `GH_TOKEN` como secret no Cloudflare.
4. Rodar a primeira atualização imediata do perfil.
