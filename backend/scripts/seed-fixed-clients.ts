import { pool } from "../src/db/pool";
import { env } from "../src/config/env";

type ClientSeed = {
  cliente: string;
  nome_legal: string;
  endereco: string;
  nif: string;
};

type QueryDb = {
  query: typeof pool.query;
};

const CLIENTS: ClientSeed[] = [
  { cliente: "ARBN Novo", nome_legal: "Por preencher", endereco: "—", nif: "—" },
  { cliente: "ARNB Yotel", nome_legal: "—", endereco: "Rua de Gonçalo Cristóvão 206‑216, Porto", nif: "—" },
  { cliente: "Bar Atman", nome_legal: "Jasmin Inédito LDA", endereco: "Rua Cândido dos Reis 74, Porto", nif: "518050971" },
  { cliente: "Bellano", nome_legal: "Previsão Especial LDA", endereco: "Rua Cândido dos Reis 74, Porto", nif: "514783419" },
  { cliente: "Cellar 47", nome_legal: "E‑Commerce de Vinhos C1, LDA", endereco: "Caminho da Gateira 702, 4900‑066 Afife", nif: "514973595" },
  { cliente: "Escritório Nortada", nome_legal: "Grupo The Royal Cocktail Club SGPS LDA", endereco: "Rua Cândido dos Reis 74, Porto", nif: "517906848" },
  { cliente: "Escritório Ramalde", nome_legal: "A Beneficência Familiar – ASM", endereco: "Rua Formosa 349", nif: "500746516" },
  { cliente: "Escritório São Mamede", nome_legal: "A Beneficência Familiar – ASM", endereco: "Rua Formosa 349", nif: "500746516" },
  { cliente: "Gym", nome_legal: "A Beneficência Familiar – ASM", endereco: "Rua Formosa 349", nif: "500746516" },
  { cliente: "Making Success", nome_legal: "Manifeststars", endereco: "R. Albino Vieira da Costa 45, 4465‑331 São Mamede de Infesta", nif: "516012304" },
  { cliente: "Nortada", nome_legal: "Viagem de Aromas LDA", endereco: "Rua Cândido dos Reis 74, Porto", nif: "517710404" },
  { cliente: "Plasctic", nome_legal: "Live & Rare LDA", endereco: "Av. dos Descobrimentos, Póvoa de Varzim", nif: "509431380" },
  { cliente: "Tokotai", nome_legal: "Pure Satisfação LDA", endereco: "Av. Dr. Antunes Guimarães 4999, Porto", nif: "516688090" }
];

async function getSharedOrganizationId(db: QueryDb = pool) {
  const organizationName = String(env.SHARED_ORGANIZATION_NAME || "Shared Workspace").trim() || "Shared Workspace";
  const existing = await db.query<{ id: string }>(
    `SELECT id
     FROM organizations
     WHERE name = $1
     ORDER BY created_at ASC
     LIMIT 1`,
    [organizationName]
  );

  if (existing.rows[0]?.id) {
    return existing.rows[0].id;
  }

  const created = await db.query<{ id: string }>(
    `INSERT INTO organizations (name)
     VALUES ($1)
     RETURNING id`,
    [organizationName]
  );

  return created.rows[0].id;
}

async function upsertClient(db: QueryDb = pool, organizationId: string, seed: ClientSeed) {
  const updated = await db.query(
    `UPDATE clients
     SET company_name = $1,
         nif = $2,
         address = $3,
         updated_at = NOW()
     WHERE organization_id = $4
       AND name = $5
     RETURNING id`,
    [seed.nome_legal, seed.nif, seed.endereco, organizationId, seed.cliente]
  );

  if (updated.rowCount) return updated.rows[0].id as string;

  const inserted = await db.query<{ id: string }>(
    `INSERT INTO clients (organization_id, name, company_name, nif, address)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [organizationId, seed.cliente, seed.nome_legal, seed.nif, seed.endereco]
  );

  return inserted.rows[0].id;
}

async function seedClients() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const organizationId = await getSharedOrganizationId(client);

    for (const seed of CLIENTS) {
      await upsertClient(client, organizationId, seed);
    }

    await client.query("COMMIT");
    // eslint-disable-next-line no-console
    console.log(`Seeded ${CLIENTS.length} clients into shared workspace.`);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

seedClients().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exit(1);
});
