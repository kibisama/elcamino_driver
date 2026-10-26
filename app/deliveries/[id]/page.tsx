import Page from '../../page'

type DeliveryDetailRouteProps = { params: Promise<{ id: string }> }

export default async function DeliveryDetailRoute({ params }: DeliveryDetailRouteProps) {
  const { id } = await params
  return <Page initialView="detail" initialId={id} />
}
