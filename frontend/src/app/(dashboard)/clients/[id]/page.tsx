import { ClientDetailScreen } from "@/features/clients/components/client-detail-screen";
import { hasServerPermission, requireServerAuthContext } from "@/server/auth/context";
import { canReadNetworkClients } from "@/server/auth/client-network-access";
import { getClientById, getClientByIdForBranch } from "@/server/repositories/client-read-repository";

export const dynamic = "force-dynamic";

export default async function ClientCardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const auth = await requireServerAuthContext();

  if (!hasServerPermission(auth, "client.view")) {
    return null;
  }

  const { id } = await params;
  const client = await canReadNetworkClients(auth)
    ? await getClientById(id)
    : await getClientByIdForBranch(id, auth.currentBranch.id);

  return <ClientDetailScreen client={client} />;
}
