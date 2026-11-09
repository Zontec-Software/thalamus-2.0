<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { canSeePersonBlock, cpfError, maskCpf, maskPhone, personView, type PersonBlock } from '../../domain/organization'
import { lookupCep, maskZip, zipDigits, type CepAddress } from '../../domain/cep'
import { ACCOUNT_KINDS, BONDS, CNH_CATEGORIES, EDUCATION, GENDER, MARITAL_STATUS, PCD, RACE, SEX, SHIRT_SIZES, SHOE_SIZES, STATES } from '../../domain/personCatalog'
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

const baseline = ref('')
const applying = ref(false)
const zipStatus = ref<'idle' | 'loading' | 'ready' | 'missing' | 'failed'>('idle')
const locked = reactive({ street: false, district: false, city: false, state: false })
let zipTicket = 0
function lockFrom(address: CepAddress) {
  locked.street = address.street !== ''
  locked.district = address.district !== ''
  locked.city = address.city !== ''
  locked.state = address.state !== ''
}
function clearPulled() {
  form.street = ''
  form.district = ''
  form.city = ''
  form.state = ''
  locked.street = false
  locked.district = false
  locked.city = false
  locked.state = false
}
function rememberAddress() {
  zipTicket += 1
  zipStatus.value = 'idle'
  if (zipDigits(form.zip).length === 8) lockFrom(form)
  else Object.assign(locked, { street: false, district: false, city: false, state: false })
}
const zipHint = computed(() => {
  if (zipStatus.value === 'loading') return 'Buscando o endereço…'
  if (zipStatus.value === 'missing') return 'CEP não encontrado.'
  if (zipStatus.value === 'failed') return 'Não foi possível consultar o CEP.'
  if (zipStatus.value === 'ready' && (!locked.street || !locked.district)) return 'Este CEP não traz o logradouro completo. Complete o que ficou em branco.'
  return ''
})
async function onZip(event: Event) {
  form.zip = maskZip((event.target as HTMLInputElement).value)
  const digits = zipDigits(form.zip)
  const ticket = ++zipTicket
  if (digits.length < 8) {
    zipStatus.value = 'idle'
    clearPulled()
    return
  }
  zipStatus.value = 'loading'
  try {
    const found = await lookupCep(digits)
    if (ticket !== zipTicket) return
    if (!found) {
      clearPulled()
      zipStatus.value = 'missing'
      return
    }
    Object.assign(form, found)
    lockFrom(found)
    zipStatus.value = 'ready'
  } catch {
    if (ticket !== zipTicket) return
    clearPulled()
    zipStatus.value = 'failed'
  }
}

function load() {
  if (baseline.value && JSON.stringify(form) !== baseline.value && !applying.value) return
  const current = person.value
  if (!current) return
  for (const key of Object.keys(form) as (keyof typeof form)[]) form[key] = String((current as unknown as Record<string, unknown>)[key] ?? '')
  form.cpf = maskCpf(form.cpf)
  form.phone = maskPhone(form.phone)
  Object.assign(form, {
    street: current.address?.street ?? '', number: current.address?.number ?? '', district: current.address?.district ?? '',
    complement: current.address?.complement ?? '', zip: maskZip(current.address?.zip ?? ''), state: current.address?.state ?? '', city: current.address?.city ?? '',
  })
  baseline.value = JSON.stringify(form)
  rememberAddress()
}
const dirty = computed(() => baseline.value !== '' && JSON.stringify(form) !== baseline.value)
defineExpose({ isDirty: () => dirty.value })
watch(person, load, { immediate: true })

function listed(options: readonly string[], current: string) {
  return current && !options.includes(current) ? [current, ...options] : options
}

const keep = (allowed: boolean, value: string, current: string | undefined) => allowed ? value || undefined : current
const cpfProblem = computed(() => show('documentos') ? cpfError(form.cpf) : '')
function onCpf(event: Event) {
  form.cpf = maskCpf((event.target as HTMLInputElement).value)
}
function onPhone(event: Event) {
  form.phone = maskPhone((event.target as HTMLInputElement).value)
}
function onEmergencyPhone(event: Event) {
  extra.emergencyPhone = maskPhone((event.target as HTMLInputElement).value)
}
function savePersonal() {
  const current = person.value
  if (!current) return
  if (cpfProblem.value) {
    ui.notify('error', cpfProblem.value)
    return
  }
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
  applying.value = true
  try {
    store.updatePerson(current.id, patch)
  } finally {
    applying.value = false
  }
}
function saveHealth() {
  const current = person.value
  if (!current) return
  applying.value = true
  try {
    store.updatePerson(current.id, {
    shoeSize: form.shoeSize || undefined, shirtSize: form.shirtSize || undefined, commute: form.commute || undefined,
    race: keep(show('saude'), form.race, current.race),
    pcd: keep(show('saude'), form.pcd, current.pcd),
    height: keep(show('saude'), form.height, current.height),
    drugAllergy: keep(show('saude'), form.drugAllergy, current.drugAllergy),
    foodAllergy: keep(show('saude'), form.foodAllergy, current.foodAllergy),
    controlledMedicine: keep(show('saude'), form.controlledMedicine, current.controlledMedicine),
  })
  } finally {
    applying.value = false
  }
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
          <div class="field"><label>Sexo</label><select v-model="form.sex"><option v-for="option in listed(SEX, form.sex)" :key="option">{{ option }}</option></select></div>
          <div class="field"><label>Gênero</label><select v-model="form.gender"><option v-for="option in listed(GENDER, form.gender)" :key="option">{{ option }}</option></select></div>
          <div class="field"><label>Estado civil</label><select v-model="form.maritalStatus"><option v-for="option in listed(MARITAL_STATUS, form.maritalStatus)" :key="option">{{ option }}</option></select></div>
          <div class="field"><label>Escolaridade</label><select v-model="form.educationLevel"><option v-for="option in listed(EDUCATION, form.educationLevel)" :key="option">{{ option }}</option></select></div>
        </div>
      </section>

      <section v-if="show('documentos')" class="person-section">
        <h3>Documentos</h3>
        <div class="form-grid">
          <div class="field"><label>CPF</label><input :value="form.cpf" inputmode="numeric" autocomplete="off" placeholder="000.000.000-00" @input="onCpf" /><p v-if="cpfProblem" class="hint">{{ cpfProblem }}</p></div>
          <div class="field"><label>RG</label><input v-model="form.rg" /></div>
          <div class="field"><label>CNH</label><input v-model="form.cnh" /></div>
          <div class="field"><label>Categoria da CNH</label><select v-model="form.cnhCategory"><option v-for="option in listed(CNH_CATEGORIES, form.cnhCategory)" :key="option">{{ option }}</option></select></div>
        </div>
      </section>

      <section class="person-section">
        <h3>Contato</h3>
        <div class="form-grid">
          <div class="field"><label>E-mail corporativo</label><input v-model="form.corporateEmail" /></div>
          <div class="field"><label>E-mail pessoal</label><input v-model="form.personalEmail" /></div>
          <div class="field"><label>Celular</label><input :value="form.phone" inputmode="tel" autocomplete="off" placeholder="(00) 00000-0000" @input="onPhone" /></div>
          <div class="field"><label>Ramal</label><input v-model="form.extension" /></div>
        </div>
      </section>

      <section v-if="show('endereco')" class="person-section">
        <h3>Endereço</h3>
        <div class="address-grid">
          <div class="field"><label>CEP</label><input :value="form.zip" inputmode="numeric" autocomplete="postal-code" placeholder="00000-000" @input="onZip" /><small v-if="zipHint">{{ zipHint }}</small></div>
          <div class="field street"><label>Logradouro</label><input v-model="form.street" :readonly="locked.street" /></div>
          <div class="field"><label>Número</label><input v-model="form.number" /></div>
          <div class="field"><label>Complemento</label><input v-model="form.complement" /></div>
          <div class="field district"><label>Bairro</label><input v-model="form.district" :readonly="locked.district" /></div>
          <div class="field city"><label>Cidade</label><input v-model="form.city" :readonly="locked.city" /></div>
          <div class="field">
            <label>Estado</label>
            <input v-if="locked.state" :value="form.state" readonly />
            <select v-else v-model="form.state"><option v-for="option in listed(STATES, form.state)" :key="option">{{ option }}</option></select>
          </div>
        </div>
      </section>

      <section class="person-section">
        <h3>Observações</h3>
        <div class="field"><input v-model="form.notes" placeholder="Algo que a equipe precisa saber" /></div>
        <div class="save-bar"><button class="button" :disabled="!!cpfProblem" @click="savePersonal">Salvar dados pessoais</button></div>
      </section>

      <section class="person-section">
        <h3>Contato de emergência</h3>
        <div v-for="entry in person.emergencies" :key="entry.phone + entry.name" class="list-row static"><div><strong>{{ entry.name }}</strong><span>{{ entry.bond }} · {{ maskPhone(entry.phone) }}</span></div></div>
        <div class="inline-form row">
          <input v-model="extra.emergencyName" class="filter" placeholder="Nome" />
          <input :value="extra.emergencyPhone" class="filter" inputmode="tel" placeholder="(00) 00000-0000" @input="onEmergencyPhone" />
          <select v-model="extra.emergencyBond" class="filter"><option v-for="option in BONDS" :key="option">{{ option }}</option></select>
          <button class="button secondary small" @click="addEmergency">Incluir</button>
        </div>
      </section>

      <section v-if="show('familia')" class="person-section">
        <h3>Família e dependentes</h3>
        <div v-for="entry in person.family" :key="entry.name" class="list-row static"><div><strong>{{ entry.name }}</strong><span>{{ entry.bond }}</span></div></div>
        <div class="inline-form row">
          <input v-model="extra.relativeName" class="filter" placeholder="Nome" />
          <select v-model="extra.bond" class="filter"><option v-for="option in BONDS" :key="option">{{ option }}</option></select>
          <button class="button secondary small" @click="addRelative">Incluir</button>
        </div>
      </section>

      <section class="person-section">
        <h3>Formação</h3>
        <div v-for="entry in person.education" :key="entry.course + entry.institution" class="list-row static"><div><strong>{{ entry.course || entry.level }}</strong><span>{{ entry.institution }} · {{ entry.level }}</span></div></div>
        <div class="inline-form row">
          <input v-model="extra.course" class="filter" placeholder="Curso" />
          <input v-model="extra.institution" class="filter" placeholder="Instituição" />
          <select v-model="extra.level" class="filter"><option v-for="option in EDUCATION" :key="option">{{ option }}</option></select>
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
          <div class="field"><label>PCD</label><select v-model="form.pcd"><option v-for="option in listed(PCD, form.pcd)" :key="option">{{ option }}</option></select></div>
          <div class="field"><label>Cor ou raça</label><select v-model="form.race"><option v-for="option in listed(RACE, form.race)" :key="option">{{ option }}</option></select></div>
          <div class="field"><label>Altura</label><input v-model="form.height" /></div>
        </div>
        <p class="hint">Registro para emergência e inclusão. Prontuário, ASO e afastamento não ficam aqui.</p>
      </section>
      <section class="person-section">
        <h3>Medidas e trajeto</h3>
        <div class="form-grid">
          <div class="field"><label>Camisa</label><select v-model="form.shirtSize"><option v-for="option in listed(SHIRT_SIZES, form.shirtSize)" :key="option">{{ option }}</option></select></div>
          <div class="field"><label>Calçado</label><select v-model="form.shoeSize"><option v-for="option in listed(SHOE_SIZES, form.shoeSize)" :key="option">{{ option }}</option></select></div>
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
        <select v-model="extra.kind" class="filter"><option v-for="option in ACCOUNT_KINDS" :key="option">{{ option }}</option></select>
        <button class="button secondary small" @click="addBank">Incluir</button>
      </div>
    </section>
  </div>
</template>
