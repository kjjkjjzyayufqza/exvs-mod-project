import MainPage from "../page/Main/page"
import ExtractFilePage from "../page/Extract/page"
import DDSConversion from "../page/ImageCov/page"
import FileEdit from "../page/FIleEdit/page"
import { Calendar, Home, Inbox, Search, Settings } from "lucide-react"
// Menu items.
export const RouterItems = [
    {
        title: "Home",
        url: "/",
        icon: Home,
        element: <MainPage />
    },
    {
        title: "Extract",
        url: "/Extract",
        icon: Home,
        element: <ExtractFilePage />
    },
    {
        title: "Repack",
        url: "/Repack",
        icon: Home,
        element: <MainPage />
    },
    {
        url: "/DDSConversion",
        title: "DDSConversion",
        icon: Home,
        element: <DDSConversion />
    },
    {
        title: "FileEdit",
        url: "/FileEdit",
        icon: Home,
        element: <FileEdit />
    },
]
