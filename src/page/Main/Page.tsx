import AppShellLayout from "../../layout/Sidebar";
import { RouterProvider } from "react-router-dom";
import { router } from "../../routers/routers";
export default function MainPage() {
  return (
    <AppShellLayout>
      <RouterProvider router={router} />
    </AppShellLayout>
  );
}
