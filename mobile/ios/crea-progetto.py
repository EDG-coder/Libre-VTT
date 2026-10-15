#!/usr/bin/env python3
"""Scrive LibreVTT.xcodeproj/project.pbxproj (il progetto di Xcode).

Non serve lanciarlo: il progetto è già nella cartella. Serve solo se si aggiungono file
all'app (aggiungerli qui sotto e rilanciare: python3 crea-progetto.py).
Gli identificativi sono sempre gli stessi (derivati dai nomi): rilanciarlo non cambia niente.
"""
import hashlib
import os
import re

QUI = os.path.dirname(os.path.abspath(__file__))
NOME = "LibreVTT"

SWIFT = ["AppDelegate.swift", "ViewController.swift", "Motore.swift"]
C = ["AvvioNode.c"]
HEADER = ["AvvioNode.h", "LibreVTT-Bridging-Header.h"]
RISORSE = ["Assets.xcassets", "nodejs-project"]          # nodejs-project: cartella copiata così com'è
FRAMEWORK_DINAMICI = ["NodeMobile.xcframework"]           # vanno anche dentro l'app (Embed & Sign)
FRAMEWORK_STATICI = ["UffaLink.xcframework"]

TIPI = {
    ".swift": "sourcecode.swift", ".c": "sourcecode.c.c", ".h": "sourcecode.c.h",
    ".xcassets": "folder.assetcatalog", ".plist": "text.plist.xml", ".xcconfig": "text.xcconfig",
    ".xcframework": "wrapper.xcframework", ".app": "wrapper.application",
}


def ident(*parti):
    return hashlib.md5("/".join(parti).encode()).hexdigest()[:24].upper()


def tipo(nome):
    if nome == "nodejs-project":
        return "folder"
    return TIPI[os.path.splitext(nome)[1]]


oggetti = {}


def aggiungi(i, **campi):
    oggetti[i] = campi
    return i


def rif(nome, cartella="", sorgente="<group>"):
    return aggiungi(ident("rif", cartella, nome), isa="PBXFileReference", lastKnownFileType=tipo(nome),
                    path=nome, sourceTree=sorgente)


# ---------- file ----------
r_swift = [rif(n, NOME) for n in SWIFT]
r_c = [rif(n, NOME) for n in C]
r_h = [rif(n, NOME) for n in HEADER]
r_ris = [rif(n, NOME) for n in RISORSE]
r_plist = rif("Info.plist", NOME)
r_conf = rif("Config.xcconfig")
r_fwd = [rif(n, "Frameworks") for n in FRAMEWORK_DINAMICI]
r_fws = [rif(n, "Frameworks") for n in FRAMEWORK_STATICI]
r_app = aggiungi(ident("prodotto"), isa="PBXFileReference", explicitFileType="wrapper.application",
                 includeInIndex="0", path=NOME + ".app", sourceTree="BUILT_PRODUCTS_DIR")


def bf(fase, r, **extra):
    return aggiungi(ident("bf", fase, r), isa="PBXBuildFile", fileRef=r, **extra)


# ---------- fasi ----------
f_sorgenti = aggiungi(ident("fase", "sorgenti"), isa="PBXSourcesBuildPhase", buildActionMask="2147483647",
                      files=[bf("s", r) for r in r_swift + r_c], runOnlyForDeploymentPostprocessing="0")
f_framework = aggiungi(ident("fase", "framework"), isa="PBXFrameworksBuildPhase", buildActionMask="2147483647",
                       files=[bf("f", r) for r in r_fwd + r_fws], runOnlyForDeploymentPostprocessing="0")
f_risorse = aggiungi(ident("fase", "risorse"), isa="PBXResourcesBuildPhase", buildActionMask="2147483647",
                     files=[bf("r", r) for r in r_ris], runOnlyForDeploymentPostprocessing="0")
f_incorpora = aggiungi(ident("fase", "incorpora"), isa="PBXCopyFilesBuildPhase", buildActionMask="2147483647",
                       dstPath='""', dstSubfolderSpec="10", name="Embed Frameworks",
                       files=[bf("e", r, settings={"ATTRIBUTES": ["CodeSignOnCopy", "RemoveHeadersOnCopy"]}) for r in r_fwd],
                       runOnlyForDeploymentPostprocessing="0")

# ---------- gruppi ----------
g_app = aggiungi(ident("gruppo", NOME), isa="PBXGroup", children=r_swift + r_c + r_h + [r_plist] + r_ris,
                 path=NOME, sourceTree="<group>")
g_fw = aggiungi(ident("gruppo", "Frameworks"), isa="PBXGroup", children=r_fwd + r_fws, path="Frameworks", sourceTree="<group>")
g_prod = aggiungi(ident("gruppo", "Products"), isa="PBXGroup", children=[r_app], name="Products", sourceTree="<group>")
g_main = aggiungi(ident("gruppo", "main"), isa="PBXGroup", children=[r_conf, g_app, g_fw, g_prod], sourceTree="<group>")

# ---------- impostazioni ----------
comuni = {
    "ALWAYS_SEARCH_USER_PATHS": "NO",
    "CLANG_ANALYZER_NONNULL": "YES",
    "CLANG_CXX_LANGUAGE_STANDARD": "gnu++20",
    "CLANG_ENABLE_MODULES": "YES",
    "CLANG_ENABLE_OBJC_ARC": "YES",
    "CLANG_WARN_BLOCK_CAPTURE_AUTORELEASING": "YES",
    "CLANG_WARN_BOOL_CONVERSION": "YES",
    "CLANG_WARN_COMMA": "YES",
    "CLANG_WARN_CONSTANT_CONVERSION": "YES",
    "CLANG_WARN_EMPTY_BODY": "YES",
    "CLANG_WARN_ENUM_CONVERSION": "YES",
    "CLANG_WARN_INFINITE_RECURSION": "YES",
    "CLANG_WARN_INT_CONVERSION": "YES",
    "CLANG_WARN_UNREACHABLE_CODE": "YES",
    "COPY_PHASE_STRIP": "NO",
    "ENABLE_STRICT_OBJC_MSGSEND": "YES",
    "GCC_C_LANGUAGE_STANDARD": "gnu17",
    "GCC_NO_COMMON_BLOCKS": "YES",
    "GCC_WARN_64_TO_32_BIT_CONVERSION": "YES",
    "GCC_WARN_UNDECLARED_SELECTOR": "YES",
    "GCC_WARN_UNINITIALIZED_AUTOS": "YES_AGGRESSIVE",
    "GCC_WARN_UNUSED_FUNCTION": "YES",
    "GCC_WARN_UNUSED_VARIABLE": "YES",
    "IPHONEOS_DEPLOYMENT_TARGET": "15.0",
    "SDKROOT": "iphoneos",
}
prog_debug = dict(comuni, **{
    "DEBUG_INFORMATION_FORMAT": "dwarf",
    "ENABLE_TESTABILITY": "YES",
    "GCC_DYNAMIC_NO_PIC": "NO",
    "GCC_OPTIMIZATION_LEVEL": "0",
    "GCC_PREPROCESSOR_DEFINITIONS": ["DEBUG=1", "$(inherited)"],
    "ONLY_ACTIVE_ARCH": "YES",
    "SWIFT_ACTIVE_COMPILATION_CONDITIONS": "DEBUG $(inherited)",
    "SWIFT_OPTIMIZATION_LEVEL": "-Onone",
})
prog_release = dict(comuni, **{
    "DEBUG_INFORMATION_FORMAT": "dwarf-with-dsym",
    "ENABLE_NS_ASSERTIONS": "NO",
    "SWIFT_COMPILATION_MODE": "wholemodule",
    "SWIFT_OPTIMIZATION_LEVEL": "-O",
    "VALIDATE_PRODUCT": "YES",
})
bersaglio = {
    "ASSETCATALOG_COMPILER_APPICON_NAME": "AppIcon",
    "CODE_SIGN_STYLE": "Automatic",
    "DEAD_CODE_STRIPPING": "YES",
    "ENABLE_BITCODE": "NO",
    "INFOPLIST_FILE": NOME + "/Info.plist",
    "LD_RUNPATH_SEARCH_PATHS": ["$(inherited)", "@executable_path/Frameworks"],
    "OTHER_LDFLAGS": ["$(inherited)", "$(UFFA_LINK_LDFLAGS)"],
    "PRODUCT_NAME": "$(TARGET_NAME)",
    "SUPPORTS_MACCATALYST": "NO",
    "SUPPORTS_MAC_DESIGNED_FOR_IPHONE_IPAD": "YES",
    "SUPPORTS_XR_DESIGNED_FOR_IPHONE_IPAD": "NO",
    "SWIFT_EMIT_LOC_STRINGS": "NO",
    "SWIFT_OBJC_BRIDGING_HEADER": NOME + "/" + NOME + "-Bridging-Header.h",
    "SWIFT_VERSION": "5.0",
    "TARGETED_DEVICE_FAMILY": "1,2",
}


def configurazioni(chi, debug, release, base=None):
    lista = []
    for nome, imp in (("Debug", debug), ("Release", release)):
        campi = dict(isa="XCBuildConfiguration", buildSettings=imp, name=nome)
        if base:
            campi["baseConfigurationReference"] = base
        lista.append(aggiungi(ident("conf", chi, nome), **campi))
    return aggiungi(ident("lista", chi), isa="XCConfigurationList", buildConfigurations=lista,
                    defaultConfigurationIsVisible="0", defaultConfigurationName="Release")


c_prog = configurazioni("progetto", prog_debug, prog_release)
c_bers = configurazioni("bersaglio", bersaglio, bersaglio, base=r_conf)

t_app = aggiungi(ident("bersaglio", NOME), isa="PBXNativeTarget", buildConfigurationList=c_bers,
                 buildPhases=[f_sorgenti, f_framework, f_risorse, f_incorpora], buildRules=[], dependencies=[],
                 name=NOME, productName=NOME, productReference=r_app, productType="com.apple.product-type.application")

radice = aggiungi(ident("progetto"), isa="PBXProject",
                  attributes={"BuildIndependentTargetsInParallel": "1", "LastSwiftUpdateCheck": "1600",
                              "LastUpgradeCheck": "1600", "TargetAttributes": {t_app: {"CreatedOnToolsVersion": "16.0"}}},
                  buildConfigurationList=c_prog, compatibilityVersion="Xcode 14.0", developmentRegion="it",
                  hasScannedForEncodings="0", knownRegions=["it", "en", "Base"], mainGroup=g_main,
                  productRefGroup=g_prod, projectDirPath='""', projectRoot='""', targets=[t_app])

# ---------- scrittura (formato «old-style plist» di Xcode) ----------
SEMPLICE = re.compile(r"^[A-Za-z0-9_./]+$")


def valore(v, rientro):
    if isinstance(v, dict):
        dentro = "".join(f"{rientro}\t{chiave(k)} = {valore(x, rientro + chr(9))};\n" for k, x in v.items())
        return "{\n" + dentro + rientro + "}"
    if isinstance(v, list):
        dentro = "".join(f"{rientro}\t{valore(x, rientro + chr(9))},\n" for x in v)
        return "(\n" + dentro + rientro + ")"
    s = str(v)
    if s == '""' or SEMPLICE.match(s):
        return s
    return '"' + s.replace("\\", "\\\\").replace('"', '\\"') + '"'


def chiave(k):
    return k if SEMPLICE.match(k) else valore(k, "")


righe = ["// !$*UTF8*$!", "{",
         "\tarchiveVersion = 1;", "\tclasses = {", "\t};", "\tobjectVersion = 56;", "\tobjects = {"]
per_tipo = {}
for i, o in oggetti.items():
    per_tipo.setdefault(o["isa"], []).append((i, o))
for isa in sorted(per_tipo):
    righe.append("")
    righe.append(f"/* Begin {isa} section */")
    for i, o in sorted(per_tipo[isa]):
        campi = dict(isa=o["isa"], **{k: v for k, v in sorted(o.items()) if k != "isa"})
        righe.append(f"\t\t{i} = {valore(campi, chr(9) * 2)};")
    righe.append(f"/* End {isa} section */")
righe += ["\t};", f"\trootObject = {radice};", "}", ""]

cartella = os.path.join(QUI, NOME + ".xcodeproj")
os.makedirs(cartella, exist_ok=True)
with open(os.path.join(cartella, "project.pbxproj"), "w", encoding="utf-8") as f:
    f.write("\n".join(righe))

# lo schema condiviso: così «Product → Archive» e xcodebuild lo trovano subito
schemi = os.path.join(cartella, "xcshareddata", "xcschemes")
os.makedirs(schemi, exist_ok=True)
with open(os.path.join(schemi, NOME + ".xcscheme"), "w", encoding="utf-8") as f:
    f.write(f'''<?xml version="1.0" encoding="UTF-8"?>
<Scheme LastUpgradeVersion = "1600" version = "1.7">
   <BuildAction parallelizeBuildables = "YES" buildImplicitDependencies = "YES">
      <BuildActionEntries>
         <BuildActionEntry buildForTesting = "YES" buildForRunning = "YES" buildForProfiling = "YES" buildForArchiving = "YES" buildForAnalyzing = "YES">
            <BuildableReference BuildableIdentifier = "primary" BlueprintIdentifier = "{t_app}" BuildableName = "{NOME}.app" BlueprintName = "{NOME}" ReferencedContainer = "container:{NOME}.xcodeproj">
            </BuildableReference>
         </BuildActionEntry>
      </BuildActionEntries>
   </BuildAction>
   <TestAction buildConfiguration = "Debug" selectedDebuggerIdentifier = "Xcode.DebuggerFoundation.Debugger.LLDB" selectedLauncherIdentifier = "Xcode.DebuggerFoundation.Launcher.LLDB" shouldUseLaunchSchemeArgsEnv = "YES">
   </TestAction>
   <LaunchAction buildConfiguration = "Debug" selectedDebuggerIdentifier = "Xcode.DebuggerFoundation.Debugger.LLDB" selectedLauncherIdentifier = "Xcode.DebuggerFoundation.Launcher.LLDB" launchStyle = "0" useCustomWorkingDirectory = "NO" ignoresPersistentStateOnLaunch = "NO" debugDocumentVersioning = "YES" debugServiceExtension = "internal" allowLocationSimulation = "YES">
      <BuildableProductRunnable runnableDebuggingMode = "0">
         <BuildableReference BuildableIdentifier = "primary" BlueprintIdentifier = "{t_app}" BuildableName = "{NOME}.app" BlueprintName = "{NOME}" ReferencedContainer = "container:{NOME}.xcodeproj">
         </BuildableReference>
      </BuildableProductRunnable>
   </LaunchAction>
   <ProfileAction buildConfiguration = "Release" shouldUseLaunchSchemeArgsEnv = "YES" savedToolIdentifier = "" useCustomWorkingDirectory = "NO" debugDocumentVersioning = "YES">
   </ProfileAction>
   <AnalyzeAction buildConfiguration = "Debug">
   </AnalyzeAction>
   <ArchiveAction buildConfiguration = "Release" revealArchiveInOrganizer = "YES">
   </ArchiveAction>
</Scheme>
''')
print("Scritto", os.path.relpath(cartella))
