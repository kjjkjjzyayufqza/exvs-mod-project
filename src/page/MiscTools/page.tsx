import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Wrench, FileText, Calculator, Palette, File, FileJson, ImageIcon, FileEdit, GitCompareArrows } from "lucide-react"
import { FBXItemRename } from "./components/fbx-item-rename/FBXItemRename"
import { TemplateJsonGenerator } from "./components/template-json-generator/TemplateJsonGenerator"
import { ImgToNutexbTool } from "./components/img-to-nutexb/ImgToNutexbTool"
import { NumatbEditor } from "./components/numatb-editor/NumatbEditor"
import { GvsMapToVs2Tool } from "./components/gvs-map-to-vs2/GvsMapToVs2Tool"
import { Fhm2dImageViewTool } from "./components/fhm2d-image-view/Fhm2dImageViewTool"
import { NutexbViewTool } from "./components/nutexb-view/NutexbViewTool"
import { useTranslation } from "react-i18next"

export default function MiscToolsPage() {
  const { t } = useTranslation("misc-tools-b")
  return (
    <div className="h-full">
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">{t("page.title")}</h1>
          <p className="text-muted-foreground">
            {t("page.description")}
          </p>
        </div>

        <Separator />

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* File Operations Tool */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                {t("page.cards.fileOps.title")}
              </CardTitle>
              <CardDescription>
                {t("page.cards.fileOps.description")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="outline" className="w-full">
                {t("page.cards.fileOps.open")}
              </Button>
            </CardContent>
          </Card>

          {/* Calculator Tool */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2">
                <Calculator className="h-5 w-5" />
                {t("page.cards.calculator.title")}
              </CardTitle>
              <CardDescription>
                {t("page.cards.calculator.description")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="outline" className="w-full">
                {t("page.cards.calculator.open")}
              </Button>
            </CardContent>
          </Card>

          {/* Color Picker Tool */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2">
                <Palette className="h-5 w-5" />
                {t("page.cards.color.title")}
              </CardTitle>
              <CardDescription>
                {t("page.cards.color.description")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="outline" className="w-full">
                {t("page.cards.color.open")}
              </Button>
            </CardContent>
          </Card>

          {/* Development Tools */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2">
                <Wrench className="h-5 w-5" />
                {t("page.cards.dev.title")}
              </CardTitle>
              <CardDescription>
                {t("page.cards.dev.description")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="outline" className="w-full">
                {t("page.cards.dev.open")}
              </Button>
            </CardContent>
          </Card>

          {/* FBX Item Rename */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2">
                <File className="h-5 w-5" />
                {t("page.cards.fbx.title")}
              </CardTitle>
              <CardDescription>
                {t("page.cards.fbx.description")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <FBXItemRename />
            </CardContent>
          </Card>

          {/* Template JSON Generator */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2">
                <FileJson className="h-5 w-5" />
                {t("page.cards.template.title")}
              </CardTitle>
              <CardDescription>
                {t("page.cards.template.description")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <TemplateJsonGenerator />
            </CardContent>
          </Card>

          {/* Image to Nutexb Converter */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2">
                <ImageIcon className="h-5 w-5" />
                {t("page.cards.imageToNutexb.title")}
              </CardTitle>
              <CardDescription>
                {t("page.cards.imageToNutexb.description")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ImgToNutexbTool />
            </CardContent>
          </Card>

          {/* Numatb Editor */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2">
                <FileEdit className="h-5 w-5" />
                {t("page.cards.numatb.title")}
              </CardTitle>
              <CardDescription>
                {t("page.cards.numatb.description")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <NumatbEditor />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2">
                <ImageIcon className="h-5 w-5" />
                {t("page.cards.fhm2dImage.title")}
              </CardTitle>
              <CardDescription>
                {t("page.cards.fhm2dImage.description")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Fhm2dImageViewTool />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2">
                <ImageIcon className="h-5 w-5" />
                {t("page.cards.nutexb.title")}
              </CardTitle>
              <CardDescription>
                {t("page.cards.nutexb.description")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <NutexbViewTool />
            </CardContent>
          </Card>

          {/* GVS Map to VS2 */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2">
                <GitCompareArrows className="h-5 w-5" />
                {t("page.cards.gvs.title")}
              </CardTitle>
              <CardDescription>
                {t("page.cards.gvs.description")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <GvsMapToVs2Tool />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
