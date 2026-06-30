import { ClientsListScreen } from "@/features/clients/components/clients-list-screen";
import { hasServerPermission, requireServerAuthContext } from "@/server/auth/context";
import { canReadNetworkClients } from "@/server/auth/client-network-access";
import { listClients, listClientsForBranch } from "@/server/repositories/client-read-repository";

export const dynamic = "force-dynamic";

export default async function ClientsPage() {
  const auth = await requireServerAuthContext();

  if (!hasServerPermission(auth, "client.view")) {
    return null;
  }

  const clientsStore = await canReadNetworkClients(auth)
    ? await listClients()
    : await listClientsForBranch(auth.currentBranch.id);

  return <ClientsListScreen initialClients={clientsStore.clients} />;
}
