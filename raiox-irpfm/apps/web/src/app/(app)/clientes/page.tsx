import { redirect } from "next/navigation";

/** The client list is the dashboard ranking. */
export default function ClientsIndex() {
  redirect("/painel");
}
