#define MyAppName "RealNet Monitor Agent"
#define MyAppVersion "1.0.1"
#define MyAppPublisher "RealNet"
#define ApiUrl "https://dashrealapi.duckdns.org/api"
; IMPORTANTE: compile informando /DAgentKey="sua_chave" ou substitua abaixo.
#ifndef AgentKey
  #define AgentKey "COLE_A_CHAVE_DO_SERVIDOR_AQUI"
#endif

[Setup]
AppId={{1B857A52-8EA0-47B6-B55C-4B0A8F000001}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={autopf}\RealNetAgent
DefaultGroupName=RealNet Monitor
DisableProgramGroupPage=yes
OutputDir=output
OutputBaseFilename=RealNetAgentSetup
Compression=lzma
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=admin

[Files]
Source: "..\dist\realnet-agent.exe"; DestDir: "{app}"; Flags: ignoreversion

[Code]
var
  PersonPage: TInputQueryWizardPage;

procedure InitializeWizard;
begin
  PersonPage := CreateInputQueryPage(wpWelcome,
    'Identificação da máquina',
    'Informe quem usa esta máquina',
    'O setor e o título da máquina podem ser ajustados depois no dashboard.');
  PersonPage.Add('Nome da pessoa:', False);
end;

function NextButtonClick(CurPageID: Integer): Boolean;
begin
  Result := True;
  if CurPageID = PersonPage.ID then begin
    if Trim(PersonPage.Values[0]) = '' then begin
      MsgBox('Informe o nome da pessoa que usa esta máquina.', mbError, MB_OK);
      Result := False;
    end;
  end;
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  EnvPath, EnvText, DataDir, ExePath, TaskCmd: String;
  ResultCode: Integer;
begin
  if CurStep = ssPostInstall then begin
    DataDir := ExpandConstant('{commonappdata}\RealNetAgent');
    ForceDirectories(DataDir);
    EnvPath := DataDir + '\.env';
    EnvText := 'AGENT_API_URL={#ApiUrl}' + #13#10 +
      'AGENT_API_KEY={#AgentKey}' + #13#10 +
      'EMPLOYEE_NAME=' + PersonPage.Values[0] + #13#10 +
      'DEVICE_TITLE=' + #13#10 +
      'DEPARTMENT=' + #13#10 +
      'INTERVAL_SECONDS=10' + #13#10 +
      'DNS_TEST_HOST=google.com' + #13#10 +
      'HTTP_TEST_URL=https://www.google.com/generate_204' + #13#10 +
      'PING_TARGET=1.1.1.1' + #13#10 +
      'LATENCY_WARNING_MS=300' + #13#10 +
      'PACKET_LOSS_WARNING_PERCENT=10' + #13#10;
    SaveStringToFile(EnvPath, EnvText, False);

    ExePath := ExpandConstant('{app}\realnet-agent.exe');
    Exec('schtasks.exe', '/Delete /TN "RealNet Monitor Agent" /F', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
    TaskCmd := '/Create /TN "RealNet Monitor Agent" /TR """' + ExePath + '""" /SC ONSTART /RU SYSTEM /RL HIGHEST /F';
    Exec('schtasks.exe', TaskCmd, '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
    Exec('schtasks.exe', '/Run /TN "RealNet Monitor Agent"', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  end;
end;

[UninstallRun]
Filename: "schtasks.exe"; Parameters: "/End /TN ""RealNet Monitor Agent"""; Flags: runhidden
Filename: "schtasks.exe"; Parameters: "/Delete /TN ""RealNet Monitor Agent"" /F"; Flags: runhidden
