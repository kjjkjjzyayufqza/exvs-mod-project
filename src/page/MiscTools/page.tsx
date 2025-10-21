import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import Container from "../../layout/Container"
import { Separator } from "@/components/ui/separator"
import { Wrench, FileText, Calculator, Palette, File, FileJson, ImageIcon, FileEdit } from "lucide-react"
import { FBXItemRename } from "./components/fbx-item-rename/FBXItemRename"
import { TemplateJsonGenerator } from "./components/template-json-generator/TemplateJsonGenerator"
import { ImgToNutexbTool } from "./components/img-to-nutexb/ImgToNutexbTool"
import { NumatbEditor } from "./components/numatb-editor/NumatbEditor"

export default function MiscToolsPage() {
  return (
    <Container>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Misc Tools</h1>
          <p className="text-muted-foreground">
            Various utility tools for development and debugging
          </p>
        </div>

        <Separator />

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* File Operations Tool */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                File Operations
              </CardTitle>
              <CardDescription>
                File reading, writing, and manipulation utilities
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="outline" className="w-full">
                Open File Browser
              </Button>
            </CardContent>
          </Card>

          {/* Calculator Tool */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2">
                <Calculator className="h-5 w-5" />
                Calculator
              </CardTitle>
              <CardDescription>
                Basic calculations and conversions
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="outline" className="w-full">
                Open Calculator
              </Button>
            </CardContent>
          </Card>

          {/* Color Picker Tool */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2">
                <Palette className="h-5 w-5" />
                Color Tools
              </CardTitle>
              <CardDescription>
                Color picker and conversion utilities
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="outline" className="w-full">
                Open Color Picker
              </Button>
            </CardContent>
          </Card>

          {/* Development Tools */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2">
                <Wrench className="h-5 w-5" />
                Dev Tools
              </CardTitle>
              <CardDescription>
                Development and debugging utilities
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="outline" className="w-full">
                Open Dev Console
              </Button>
            </CardContent>
          </Card>

          {/* FBX Item Rename */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2">
                <File className="h-5 w-5" />
                FBX Item Rename
              </CardTitle>
              <CardDescription>
                Load and analyze FBX model files
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
                Template JSON Generator
              </CardTitle>
              <CardDescription>
                Generate template JSON files by scanning folder structures
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
                Image to Nutexb
              </CardTitle>
              <CardDescription>
                Convert image files to nutexb format with custom output directory
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
                Numatb Editor
              </CardTitle>
              <CardDescription>
                Edit material properties in .numatb files
              </CardDescription>
            </CardHeader>
            <CardContent>
              <NumatbEditor />
            </CardContent>
          </Card>
        </div>
      </div>
    </Container>
  );
}
