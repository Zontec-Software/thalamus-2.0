<script setup lang="ts">
import { computed, reactive, watch } from 'vue'
import { canSeePersonBlock, personView, type PersonBlock } from '../../domain/organization'
import { useErpStore } from '../../stores/erp'
import { useUiStore } from '../../stores/ui'
import type { Person } from '../../types/domain'

const props = defineProps<{ personId: string; part: 'pessoal' | 'saude' | 'banco' }>()
const store = useErpStore()
const ui = useUiStore()

const person = computed(() => store.state.persons.find(entry => entry.id === props.personId))
const account = computed(() => store.state.users.find(entry => entry.personId === props.personId && entry.homeTenantId === person.value?.tenantId))
const manages = computed(() => {
  const sector = store.state.sectors.find(entry => entry.managerId === ui.sessionUserId)
  return !!sector && !!account.value && account.value.sector === sector.name
})
const view = computed(() => person.value ? personView(ui.role, ui.sessionUserId, person.value, account.value?.id, manages.value) : 'profissional')
const show = (name: PersonBlock) => canSeePersonBlock(view.value, name)

const form = reactive({
  fullName: '', birthDate: '', sex: '', gender: '', cpf: '', rg: '', cnh: '', cnhCategory: '',
  personalEmail: '', corporateEmail: '', phone: '', extension: '', maritalStatus: '', educationLevel: '',
  race: '', pcd: '', height: '', shoeSize: '', shirtSize: '', drugAllergy: '', foodAllergy: '', controlledMedicine: '',
  notes: '', commute: '',
  street: '', number: '', district: '', complement: '', zip: '', state: '', city: '',
})
const extra = reactive({ institution: '', course: '', level: '', relativeName: '', bond: '', emergencyName: '', emergencyPhone: '', emergencyBond: '', bank: '', agency: '', account: '', kind: 'Corrente' })

function load() {
  const current = person.value
  if (!current) return
  for (const key of Object.keys(form) as (keyof typeof form)[]) form[key] = String((current as unknown as Record<string, unknown>)[key] ?? '')
  Object.assign(form, {
    street: current.address?.street ?? '', number: current.address?.number ?? '', district: current.address?.district ?? '',
    complement: current.address?.complement ?? '', zip: current.address?.zip ?? '', state: current.address?.state ?? '', city: current.address?.city ?? '',
  })
}
watch(person, load, { immediate: true })

const keep = (allowed: boolean, value: string, current: string | undefined) => allowed ? value || undefined : current
function savePersonal() {
  const current = person.value
  if (!current) return
  const patch: Partial<Person> = {
    fullName: form.fullName, sex: form.sex || undefined, gender: form.gender || undefined,
    maritalStatus: form.maritalStatus || undefined, educationLevel: form.educationLevel || undefined,
    personalEmail: form.personalEmail || undefined, corporateEmail: form.corporateEmail || undefined,
    phone: form.phone || undefined, extension: form.extension || undefined, notes: form.notes || undefined,
    birthDate: keep(show('documentos'), form.birthDate, current.birthDate),
    cpf: keep(show('documentos'), form.cpf, current.cpf),
    rg: keep(show('documentos'), form.rg, current.rg),
    cnh: keep(show('documentos'), form.cnh, current.cnh),
    cnhCategory: keep(show('documentos'), form.cnhCategory, current.cnhCategory),
  }
  if (show('endereco')) patch.address = { street: form.street, number: form.number, district: form.district, complement: form.complement || undefined, zip: form.zip, state: form.state, city: form.city }
  store.updatePerson(current.id, patch)
}
function saveHealth() {
  const current = person.value
  if (!current) return
  store.updatePerson(current.id, {
    shoeSize: form.shoeSize || undefined, shirtSize: form.shirtSize || undefined, commute: form.commute || undefined,
    race: keep(show('saude'), form.race, current.race),
    pcd: keep(show('saude'), form.pcd, current.pcd),
    height: keep(show('saude'), form.height, current.height),
    drugAllergy: keep(show('saude'), form.drugAllergy, current.drugAllergy),
    foodAllergy: keep(show('saude'), form.foodAllergy, current.foodAllergy),
    controlledMedicine: keep(show('saude'), form.controlledMedicine, current.controlledMedicine),
  })
}
function addEducation() {
  if (!person.value || !extra.institution.trim()) return
  person.value.education.push({ institution: extra.institution.trim(), course: extra.course.trim(), level: extra.level.trim() })
  Object.assign(extra, { institution: '', course: '', level: '' })
}
function addRelative() {
  if (!person.value || !show('familia') || !extra.relativeName.trim()) return
  person.value.family.push({ name: extra.relativeName.trim(), bond: extra.bond.trim() || 'Dependente' })
  Object.assign(extra, { relativeName: '', bond: '' })
}
function addEmergency() {
  if (!person.value || !extra.emergencyName.trim()) return
  person.value.emergencies.push({ name: extra.emergencyName.trim(), phone: extra.emergencyPhone.trim(), bond: extra.emergencyBond.trim() })
  Object.assign(extra, { emergencyName: '', emergencyPhone: '', emergencyBond: '' })
}
function addBank() {
  if (!person.value || !show('banco') || !extra.bank.trim()) return
  person.value.banks.push({ bank: extra.bank.trim(), agency: extra.agency.trim(), account: extra.account.trim(), kind: extra.kind })
  Object.assign(extra, { bank: '', agency: '', account: '' })
}
</script>

<template>
  <div v-if="person" data-tour="person-file">
    <p v-if="view !== 'completa' && part !== 'banco'" class="hint">Você vê só a parte profissional. Documentos, endereço, família e saúde ficam com o RH e com a própria pessoa.</p>

    <template v-if="part === 'pessoal'">
      <section class="person-section">
        <h3>Identificação</h3>
        <div class="form-grid">
          <div class="field"><label>Nome completo</label><input v-model="form.fullName" /></div>
          <div v-if="show('documentos')" class="field"><label>Nascimento</label><input v-model="form.birthDate" type="date" /></div>
          <div class="field"><label>Sexo</label><input v-model="form.sex" /></div>
          <div class="field"><label>Gênero</label><input v-model="form.gender" /></div>
          <div class="field"><label>Estado civil</label><input v-model="form.maritalStatus" /></div>
          <div class="field"><label>Escolaridade</label><input v-model="form.educationLevel" /></div>
        </div>
      </section>

      <section v-if="show('documentos')" class="person-section">
        <h3>Documentos</h3>
        <div class="form-grid">
          <div class="field"><label>CPF</label><input v-model="form.cpf" /></div>
          <div class="field"><label>RG</label><input v-model="form.rg" /></div>
          <div class="field"><label>CNH</label><input v-model="form.cnh" /></div>
          <div class="field"><label>Categoria da CNH</label><input v-model="form.cnhCategory" /></div>
        </div>
      </section>

      <section class="person-section">
        <h3>Contato</h3>
        <div class="form-grid">
          <div class="field"><label>E-mail corporativo</label><input v-model="form.corporateEmail" /></div>
          <div class="field"><label>E-mail pessoal</label><input v-model="form.personalEmail" /></div>
          <div class="field"><label>Celular</label><input v-model="form.phone" /></div>
          <div class="field"><label>Ramal</label><input v-model="form.extension" /></div>
        </div>
      </section>

      <section v-if="show('endereco')" class="person-section">
        <h3>Endereço</h3>
        <div class="form-grid">
          <div class="field"><label>CEP</label><input v-model="form.zip" /></div>
          <div class="field"><label>Logradouro</label><input v-model="form.street" /></div>
          <div class="field"><label>Número</label><input v-model="form.number" /></div>
          <div class="field"><label>Complemento</label><input v-model="form.complement" /></div>
          <div class="field"><label>Bairro</label><input v-model="form.district" /></div>
          <div class="field"><label>Cidade e estado</label><div style="display:flex;gap:8px"><input v-model="form.city" style="flex:1" /><input v-model="form.state" style="width:64px" maxlength="2" /></div></div>
        </div>
      </section>

      <section class="person-section">
        <h3>Observações</h3>
        <div class="field"><input v-model="form.notes" placeholder="Algo que a equipe precisa saber" /></div>
        <div class="save-bar"><button class="button" @click="savePersonal">Salvar dados pessoais</button></div>
      </section>

      <section class="person-section">
        <h3>Contato de emergência</h3>
        <div v-for="entry in person.emergencies" :key="entry.phone + entry.name" class="list-row static"><div><strong>{{ entry.name }}</strong><span>{{ entry.bond }} · {{ entry.phone }}</span></div></div>
        <div class="inline-form row">
          <input v-model="extra.emergencyName" class="filter" placeholder="Nome" />
          <input v-model="extra.emergencyPhone" class="filter" placeholder="Telefone" />
          <input v-model="extra.emergencyBond" class="filter" placeholder="Parentesco" />
          <button class="button secondary small" @click="addEmergency">Incluir</button>
        </div>
      </section>

      <section v-if="show('familia')" class="person-section">
        <h3>Família e dependentes</h3>
        <div v-for="entry in person.family" :key="entry.name" class="list-row static"><div><strong>{{ entry.name }}</strong><span>{{ entry.bond }}</span></div></div>
        <div class="inline-form row">
          <input v-model="extra.relativeName" class="filter" placeholder="Nome" />
          <input v-model="extra.bond" class="filter" placeholder="Cônjuge, filho, dependente" />
          <button class="button secondary small" @click="addRelative">Incluir</button>
        </div>
      </section>

      <section class="person-section">
        <h3>Formação</h3>
        <div v-for="entry in person.education" :key="entry.course + entry.institution" class="list-row static"><div><strong>{{ entry.course || entry.level }}</strong><span>{{ entry.institution }} · {{ entry.level }}</span></div></div>
        <div class="inline-form row">
          <input v-model="extra.course" class="filter" placeholder="Curso" />
          <input v-model="extra.institution" class="filter" placeholder="Instituição" />
          <input v-model="extra.level" class="filter" placeholder="Técnico, graduação…" />
          <button class="button secondary small" @click="addEducation">Incluir</button>
        </div>
      </section>
    </template>

    <template v-else-if="part === 'saude'">
      <section v-if="show('saude')" class="person-section">
        <h3>Saúde</h3>
        <div class="form-grid">
          <div class="field"><label>Alergia a medicamento</label><input v-model="form.drugAllergy" /></div>
          <div class="field"><label>Outras alergias</label><input v-model="form.foodAllergy" /></div>
          <div class="field"><label>Medicamento controlado</label><input v-model="form.controlledMedicine" /></div>
          <div class="field"><label>PCD</label><input v-model="form.pcd" /></div>
          <div class="field"><label>Cor ou raça</label><input v-model="form.race" /></div>
          <div class="field"><label>Altura</label><input v-model="form.height" /></div>
        </div>
        <p class="hint">Registro para emergência e inclusão. Prontuário, ASO e afastamento não ficam aqui.</p>
      </section>
      <section class="person-section">
        <h3>Medidas e trajeto</h3>
        <div class="form-grid">
          <div class="field"><label>Camisa</label><input v-model="form.shirtSize" /></div>
          <div class="field"><label>Calçado</label><input v-model="form.shoeSize" /></div>
          <div class="field"><label>Trajeto até a empresa</label><input v-model="form.commute" placeholder="Ônibus, 2 conduções" /></div>
        </div>
        <div class="save-bar"><button class="button" @click="saveHealth">Salvar</button></div>
      </section>
    </template>

    <section v-else-if="show('banco')" class="person-section">
      <h3>Conta para pagamento</h3>
      <div v-for="entry in person.banks" :key="entry.account" class="list-row static"><div><strong>{{ entry.bank }} · {{ entry.account }}</strong><span>Agência {{ entry.agency }} · {{ entry.kind }}</span></div></div>
      <p v-if="!person.banks.length" class="cell-sub">Nenhuma conta informada.</p>
      <div class="inline-form row">
        <input v-model="extra.bank" class="filter" placeholder="Banco" />
        <input v-model="extra.agency" class="filter" placeholder="Agência" />
        <input v-model="extra.account" class="filter" placeholder="Conta" />
        <select v-model="extra.kind" class="filter"><option>Corrente</option><option>Poupança</option><option>Salário</option></select>
        <button class="button secondary small" @click="addBank">Incluir</button>
      </div>
    </section>
  </div>
</template>
